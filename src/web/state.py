from typing import Dict, Any
from dataclasses import dataclass, field

@dataclass
class JobState:
    id: str
    status: str  # "pending", "running", "completed", "failed"
    playlist_name: str
    total_tracks: int
    current_track_index: int  # 1-based index of the track being processed
    current_track_name: str
    ok_count: int
    fail_count: int
    logs: list = field(default_factory=list)
    failed_tracks: list = field(default_factory=list)  # list of dicts with track/error info
    result_path: str = ""
    processed_tracks: int = 0  # completed tracks
    files: list = field(default_factory=list)  # list of relative file paths for direct download
    pending_files: list = field(default_factory=list)  # files waiting to be pulled by client
    served_files: set = field(default_factory=set)  # files already handed off to client
    current_download_percent: float = 0.0
    current_download_state: str = ""

# Global in-memory store
JOBS: Dict[str, JobState] = {}
MAX_CONCURRENT_JOBS = 6
