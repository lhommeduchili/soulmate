import { useParams, useNavigate } from "react-router-dom";
import { PlaylistReview } from "../components/PlaylistReview";
import { ErrorBoundary } from "../components/ErrorBoundary";

export function ReviewPage() {
  const { type, id } = useParams();
  const navigate = useNavigate();

  if (!id || !type) return null;

  return (
    <ErrorBoundary componentName="review">
      <PlaylistReview
        playlistId={id}
        playlistType={
          type as "spotify" | "youtube" | "setlist" | "soundcloud" | "bandcamp"
        }
        onBack={() => navigate("/")}
      />
    </ErrorBoundary>
  );
}
