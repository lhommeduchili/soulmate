import { useSpotifyAuthContext } from "../context/SpotifyAuthContext";
import { LoginButton } from "../components/LoginButton";
import { Navigate } from "react-router-dom";
import { useI18n } from "../context/I18nContext";

export function LoginPage() {
  const { isAuthenticated, login } = useSpotifyAuthContext();
  const { t } = useI18n();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col items-center justify-center h-full space-y-8">
      <LoginButton onClick={login} />
      <div className="text-zinc-500 font-mono text-sm">
        {t("login.connectPrompt")}
      </div>
    </div>
  );
}
