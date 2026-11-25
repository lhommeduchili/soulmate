import Store from "electron-store";
import { app } from "electron";
import { AppPreferences, DEFAULT_PREFERENCES } from "../shared/preferences";
import { DownloadItem } from "../shared/types";

const testUserDataDir = process.env.TEST_USER_DATA_DIR;
if (testUserDataDir) {
  app.setPath("userData", testUserDataDir);
}

interface StoreType {
  spotify: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  };
  soulseek?: {
    username?: string;
    password?: string;
  };
  preferences: AppPreferences;
  queue: DownloadItem[];
}

export const store = new Store<StoreType>({
  cwd: testUserDataDir || undefined,
  defaults: {
    spotify: {},
    soulseek: {},
    preferences: DEFAULT_PREFERENCES,
    queue: [],
  },
});
