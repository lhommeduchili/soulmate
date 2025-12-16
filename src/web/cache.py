from spotipy.cache_handler import CacheHandler

class NoCacheHandler(CacheHandler):
    """
    A cache handler that strictly does nothing.
    Prevents Spotipy from reading/writing tokens to a local .cache file,
    ensuring we rely solely on our per-user session storage.
    """
    def get_cached_token(self):
        return None

    def save_token_to_cache(self, token_info):
        pass
