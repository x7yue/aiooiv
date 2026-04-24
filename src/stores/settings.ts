import { create } from 'zustand';
import * as cmd from '../lib/commands';

interface SettingsState {
  base_url: string;
  api_key: string;
  loaded: boolean;
  loadSettings: () => Promise<void>;
  saveSettings: (base_url: string, api_key: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  base_url: '',
  api_key: '',
  loaded: false,

  loadSettings: async () => {
    const settings = await cmd.getSettings();
    set({ base_url: settings.base_url, api_key: settings.api_key, loaded: true });
  },

  saveSettings: async (base_url: string, api_key: string) => {
    await cmd.saveSettings(base_url, api_key);
    set({ base_url, api_key });
  },
}));
