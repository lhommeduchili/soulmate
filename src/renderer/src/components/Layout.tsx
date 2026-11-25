import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ErrorBoundary } from "./ErrorBoundary";
import { AudioPlayer } from "./AudioPlayer";
import { useLocation } from "react-router-dom";

interface Props {
  children: ReactNode;
}

export function Layout({ children }: Props): JSX.Element {
  const location = useLocation();
  const isLogin = location.pathname === "/login";

  if (isLogin) {
    return (
      <div className="h-screen w-screen bg-app-bg nocturne-ground">
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-app-bg overflow-hidden relative">
      <ErrorBoundary componentName="sidebar">
        <Sidebar />
      </ErrorBoundary>
      <main className="flex-1 flex flex-col min-w-0 nocturne-ground overflow-auto relative scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-app-surface-active scrollbar-track-transparent">
        <TopBar />
        {children}
      </main>
      <AudioPlayer />
    </div>
  );
}
