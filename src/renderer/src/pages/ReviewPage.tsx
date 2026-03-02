
import { useParams, useNavigate } from 'react-router-dom'
import { PlaylistReview } from '../components/PlaylistReview'

export function ReviewPage() {
    const { type, id } = useParams()
    const navigate = useNavigate()

    if (!id || !type) return null

    return (
        <PlaylistReview
            playlistId={id}
            playlistType={type as 'spotify' | 'youtube'}
            onBack={() => navigate('/')}
        />
    )
}
