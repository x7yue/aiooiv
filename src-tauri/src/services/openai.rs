use async_openai::{
    config::OpenAIConfig,
    types::responses::{
        CreateResponse, CreateResponseArgs, EasyInputContent, EasyInputMessage, ImageDetail,
        ImageGenActionEnum, ImageGenTool, ImageGenToolQuality, ImageGenToolSize, InputContent,
        InputImageContent, InputParam, InputTextContent, OutputItem, ResponseStreamEvent, Tool,
    },
    Client,
};
use futures::StreamExt;

use crate::{AppError, AppResult};

/// Generate image via async-openai Responses streaming API.
pub async fn generate_image(
    base_url: &str,
    api_key: &str,
    prompt: &str,
    size: &str,
    quality: &str,
    n: u8,
) -> AppResult<Vec<String>> {
    let request = build_request(
        InputParam::Text(prompt.to_owned()),
        vec![Tool::ImageGeneration(build_image_tool(
            ImageGenActionEnum::Generate,
            size,
            quality,
        )?)],
    )?;

    log::info!(
        "[openai] sending generate create_stream request: size={}, quality={}, n={}",
        size,
        quality,
        n
    );
    collect_stream_images(base_url, api_key, request, n).await
}

/// Edit image via async-openai Responses streaming API.
pub async fn edit_image(
    base_url: &str,
    api_key: &str,
    source_image_base64: &str,
    source_image_mime_type: &str,
    prompt: &str,
    size: &str,
    quality: &str,
    n: u8,
) -> AppResult<Vec<String>> {
    let message = EasyInputMessage {
        role: async_openai::types::responses::Role::User,
        content: EasyInputContent::ContentList(vec![
            InputContent::InputImage(InputImageContent {
                detail: ImageDetail::Auto,
                file_id: None,
                image_url: Some(format!(
                    "data:{source_image_mime_type};base64,{source_image_base64}"
                )),
            }),
            InputContent::InputText(InputTextContent {
                text: prompt.to_owned(),
            }),
        ]),
        ..Default::default()
    };

    let request = build_request(
        InputParam::Items(vec![
            async_openai::types::responses::InputItem::EasyMessage(message),
        ]),
        vec![Tool::ImageGeneration(build_image_tool(
            ImageGenActionEnum::Edit,
            size,
            quality,
        )?)],
    )?;

    log::info!(
        "[openai] sending edit create_stream request: size={}, quality={}, n={}",
        size,
        quality,
        n
    );
    collect_stream_images(base_url, api_key, request, n).await
}

fn build_request(input: InputParam, tools: Vec<Tool>) -> AppResult<CreateResponse> {
    CreateResponseArgs::default()
        .model("gpt-5.4")
        .input(input)
        .tools(tools)
        .build()
        .map_err(|e| AppError::message(e.to_string()))
}

async fn collect_stream_images(
    base_url: &str,
    api_key: &str,
    request: CreateResponse,
    n: u8,
) -> AppResult<Vec<String>> {
    let client = build_client(base_url, api_key);
    log::debug!("[openai] create_stream request built");

    let mut stream = client
        .responses()
        .create_stream(request)
        .await
        .map_err(|e| {
            log::error!("[openai] create_stream failed: {}", e);
            AppError::message(e.to_string())
        })?;

    let mut images = Vec::new();
    let mut partial_images: Vec<(u32, String)> = Vec::new();
    let mut event_count = 0usize;

    while let Some(event_result) = stream.next().await {
        event_count += 1;
        let event = event_result.map_err(|e| {
            log::error!("[openai] stream event error: {}", e);
            AppError::message(e.to_string())
        })?;

        match event {
            ResponseStreamEvent::ResponseImageGenerationCallInProgress(e) => {
                log::info!(
                    "[openai] stream #{} image_generation in_progress: item_id={}, output_index={}",
                    event_count,
                    e.item_id,
                    e.output_index
                );
            }
            ResponseStreamEvent::ResponseImageGenerationCallGenerating(e) => {
                log::info!(
                    "[openai] stream #{} image_generation generating: item_id={}, output_index={}",
                    event_count,
                    e.item_id,
                    e.output_index
                );
            }
            ResponseStreamEvent::ResponseImageGenerationCallPartialImage(e) => {
                log::info!(
                    "[openai] stream #{} partial_image: item_id={}, output_index={}, partial_index={}, b64_len={}",
                    event_count,
                    e.item_id,
                    e.output_index,
                    e.partial_image_index,
                    e.partial_image_b64.len()
                );
                partial_images.push((e.partial_image_index, e.partial_image_b64));
            }
            ResponseStreamEvent::ResponseImageGenerationCallCompleted(e) => {
                log::info!(
                    "[openai] stream #{} image_generation completed: item_id={}, output_index={}",
                    event_count,
                    e.item_id,
                    e.output_index
                );
            }
            ResponseStreamEvent::ResponseCompleted(e) => {
                log::info!(
                    "[openai] stream #{} response completed: output_items={}",
                    event_count,
                    e.response.output.len()
                );
                images.extend(extract_images_from_output(e.response.output));
            }
            ResponseStreamEvent::ResponseFailed(e) => {
                log::error!("[openai] stream #{} response failed: {:?}", event_count, e);
            }
            other => {
                log::debug!("[openai] stream #{} event: {:?}", event_count, other);
            }
        }
    }

    if images.is_empty() && !partial_images.is_empty() {
        partial_images.sort_by_key(|(index, _)| *index);
        let merged = partial_images
            .into_iter()
            .map(|(_, chunk)| chunk)
            .collect::<String>();
        log::info!(
            "[openai] assembled image from partial chunks, b64_len={}",
            merged.len()
        );
        images.push(merged);
    }

    images.dedup();
    images.truncate(n as usize);
    log::info!(
        "[openai] stream finished: events={}, extracted_images={}",
        event_count,
        images.len()
    );

    if images.is_empty() {
        return Err(AppError::message(
            "OpenAI stream did not contain image data".to_owned(),
        ));
    }

    Ok(images)
}

fn build_client(base_url: &str, api_key: &str) -> Client<OpenAIConfig> {
    log::debug!("[openai] building async-openai client");
    let config = OpenAIConfig::new()
        .with_api_base(base_url.to_owned())
        .with_api_key(api_key.to_owned());
    Client::with_config(config)
}

fn extract_images_from_output(output: Vec<OutputItem>) -> Vec<String> {
    output
        .into_iter()
        .filter_map(|item| match item {
            OutputItem::ImageGenerationCall(call) => {
                log::info!("[openai] found final image_generation_call output");
                call.result
            }
            other => {
                log::debug!("[openai] non-image output item: {:?}", other);
                None
            }
        })
        .collect()
}

fn build_image_tool(
    action: ImageGenActionEnum,
    size: &str,
    quality: &str,
) -> AppResult<ImageGenTool> {
    Ok(ImageGenTool {
        model: Some("gpt-image-2".to_owned()),
        action: Some(action),
        size: Some(parse_size(size)?),
        quality: Some(parse_quality(quality)?),
        background: None,
        output_format: None,
        output_compression: None,
        partial_images: Some(1),
        input_image_mask: None,
        input_fidelity: None,
        moderation: None,
    })
}

fn parse_size(value: &str) -> AppResult<ImageGenToolSize> {
    match value {
        "1024x1024" => Ok(ImageGenToolSize::Size1024x1024),
        "1024x1536" => Ok(ImageGenToolSize::Size1024x1536),
        "1536x1024" => Ok(ImageGenToolSize::Size1536x1024),
        "auto" | "" => Ok(ImageGenToolSize::Auto),
        _ => Err(AppError::message(format!(
            "Unsupported image size: {value}"
        ))),
    }
}

fn parse_quality(value: &str) -> AppResult<ImageGenToolQuality> {
    match value {
        "low" => Ok(ImageGenToolQuality::Low),
        "medium" => Ok(ImageGenToolQuality::Medium),
        "high" => Ok(ImageGenToolQuality::High),
        "auto" | "" => Ok(ImageGenToolQuality::Auto),
        _ => Err(AppError::message(format!(
            "Unsupported image quality: {value}"
        ))),
    }
}
