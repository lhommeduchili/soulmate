import Store from "electron-store";
import { app } from "electron";
import { AppPreferences, DEFAULT_PREFERENCES } from "../shared/preferences";

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
}

export const store = new Store<StoreType>({
  defaults: {
    spotify: {},
    soulseek: {},
    preferences: DEFAULT_PREFERENCES,
  },
});
