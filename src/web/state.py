from typing import Dict, Any
from dataclasses import dataclass, field

@dataclass
class JobState:
    id: str
    status: str  # "pending", "running", "completed", "failed"
    playlist_name: str
    total_tracks: int
    current_track_index: int
    current_track_name: str
    ok_count: int
    fail_count: int
    logs: list = field(default_factory=list)
    result_path: str = ""

# Global in-memory store
JOBS: Dict[str, JobState] = {}
