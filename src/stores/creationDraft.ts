import { create } from 'zustand';

export type TaskMode = 'generate' | 'edit';
export type DraftReferenceSource = 'upload' | 'generated' | 'snapshot';

export const MAX_REFERENCE_IMAGES = 16;

export interface DraftReferenceImage {
  id: string;
  source: DraftReferenceSource;
  previewUrl: string;
  name: string;
  mimeType: string;
  base64?: string;
  path?: string;
  taskId?: string;
  index?: number;
}

interface CreationDraftState {
  mode: TaskMode;
  referenceImages: DraftReferenceImage[];
  setMode: (mode: TaskMode) => void;
  addReferenceImages: (images: DraftReferenceImage[]) => void;
  removeReferenceImage: (id: string) => void;
  clearReferenceImages: () => void;
}

export const useCreationDraftStore = create<CreationDraftState>((set) => ({
  mode: 'generate',
  referenceImages: [],

  setMode: (mode) => set({ mode }),

  addReferenceImages: (images) => {
    if (images.length === 0) return;

    set((state) => {
      const next = [...state.referenceImages];
      for (const image of images) {
        if (next.length >= MAX_REFERENCE_IMAGES) break;
        if (isDuplicateReference(next, image)) continue;
        next.push(image);
      }

      return {
        mode: 'edit',
        referenceImages: next,
      };
    });
  },

  removeReferenceImage: (id) => set((state) => ({
    referenceImages: state.referenceImages.filter((image) => image.id !== id),
  })),

  clearReferenceImages: () => set({ referenceImages: [] }),
}));

function isDuplicateReference(existing: DraftReferenceImage[], candidate: DraftReferenceImage): boolean {
  if (!candidate.path) return existing.some((image) => image.id === candidate.id);
  return existing.some((image) => image.path === candidate.path);
}

export function createReferenceId(prefix: DraftReferenceSource): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`;
  }

  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}
