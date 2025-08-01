import datetime
import sqlalchemy
from sqlalchemy import Table, Column, String, DateTime, MetaData, insert, select, update, delete, Integer, Text
from typing import Dict, List, Sequence, Set, Mapping, Optional, Tuple
import json


class MatchFailureDatabase:
    """ 
    Enhanced sqlite database of match failures which persists between runs
    Now includes transfer tracking and failure reports
    This can be used concurrently between multiple processes
    """

    def __init__(self, filename='.cache.db'):
        self.engine = sqlalchemy.create_engine(f"sqlite:///{filename}")
        meta = MetaData()
        
        # Original match failures table
        self.match_failures = Table('match_failures', meta,
                                    Column('track_id', String, primary_key=True),
                                    Column('insert_time', DateTime),
                                    Column('next_retry', DateTime),
                                    Column('failure_count', Integer, default=1),
                                    Column('last_error', Text, nullable=True),
                                    sqlite_autoincrement=False)
        
        # New transfer reports table
        self.transfer_reports = Table('transfer_reports', meta,
                                     Column('transfer_id', String, primary_key=True),
                                     Column('platform', String),
                                     Column('created_at', DateTime),
                                     Column('completed_at', DateTime, nullable=True),
                                     Column('total_songs', Integer, default=0),
                                     Column('total_albums', Integer, default=0),
                                     Column('total_playlists', Integer, default=0),
                                     Column('failed_songs', Text, default='[]'),  # JSON array
                                     Column('failed_albums', Text, default='[]'),  # JSON array
                                     Column('failed_playlists', Text, default='{}'),  # JSON object
                                     Column('status', String, default='running'),
                                     sqlite_autoincrement=False)
        
        # New transfer statistics table
        self.transfer_stats = Table('transfer_stats', meta,
                                   Column('id', Integer, primary_key=True, autoincrement=True),
                                   Column('platform', String),
                                   Column('date', DateTime),
                                   Column('tracks_attempted', Integer, default=0),
                                   Column('tracks_successful', Integer, default=0),
                                   Column('albums_attempted', Integer, default=0),
                                   Column('albums_successful', Integer, default=0),
                                   Column('playlists_attempted', Integer, default=0),
                                   Column('playlists_successful', Integer, default=0))
        
        meta.create_all(self.engine)

    def _get_next_retry_time(self, insert_time: datetime.datetime | None = None, failure_count: int = 1) -> datetime.datetime:
        """Enhanced retry logic with exponential backoff based on failure count."""
        if insert_time:
            # Exponential backoff: 7 days * 2^(failure_count-1), max 30 days
            base_interval = datetime.timedelta(days=7)
            multiplier = min(2 ** (failure_count - 1), 4)  # Cap at 28 days max
            interval = base_interval * multiplier
        else:
            interval = datetime.timedelta(days=7)
        return datetime.datetime.now() + interval

    def cache_match_failure(self, track_id: str, error_message: str = None):
        """Enhanced failure caching with error tracking and failure counting."""
        fetch_statement = select(self.match_failures).where(
            self.match_failures.c.track_id == track_id)
        
        with self.engine.connect() as connection:
            with connection.begin():
                existing_failure = connection.execute(fetch_statement).fetchone()
                
                if existing_failure:
                    # Increment failure count and update retry time
                    new_failure_count = existing_failure.failure_count + 1
                    update_statement = update(self.match_failures).where(
                        self.match_failures.c.track_id == track_id
                    ).values(
                        next_retry=self._get_next_retry_time(existing_failure.insert_time, new_failure_count),
                        failure_count=new_failure_count,
                        last_error=error_message
                    )
                    connection.execute(update_statement)
                else:
                    # Create new failure entry
                    connection.execute(insert(self.match_failures), {
                        "track_id": track_id,
                        "insert_time": datetime.datetime.now(),
                        "next_retry": self._get_next_retry_time(),
                        "failure_count": 1,
                        "last_error": error_message
                    })

    def has_match_failure(self, track_id: str) -> bool:
        """Check if there was a recent search failure for the given track_id."""
        statement = select(self.match_failures.c.next_retry).where(
            self.match_failures.c.track_id == track_id)
        with self.engine.connect() as connection:
            match_failure = connection.execute(statement).fetchone()
            if match_failure:
                return match_failure.next_retry > datetime.datetime.now()
            return False

    def get_failure_info(self, track_id: str) -> Optional[Dict]:
        """Get detailed failure information for a track."""
        statement = select(self.match_failures).where(
            self.match_failures.c.track_id == track_id)
        with self.engine.connect() as connection:
            result = connection.execute(statement).fetchone()
            if result:
                return {
                    'track_id': result.track_id,
                    'insert_time': result.insert_time,
                    'next_retry': result.next_retry,
                    'failure_count': result.failure_count,
                    'last_error': result.last_error,
                    'is_active': result.next_retry > datetime.datetime.now()
                }
            return None

    def remove_match_failure(self, track_id: str):
        """Remove match failure from the database."""
        statement = delete(self.match_failures).where(
            self.match_failures.c.track_id == track_id)
        with self.engine.connect() as connection:
            with connection.begin():
                connection.execute(statement)

    def get_failure_statistics(self, days: int = 30) -> Dict:
        """Get failure statistics for the last N days."""
        cutoff_date = datetime.datetime.now() - datetime.timedelta(days=days)
        
        with self.engine.connect() as connection:
            # Total failures in period
            total_statement = select(self.match_failures).where(
                self.match_failures.c.insert_time >= cutoff_date)
            total_failures = len(connection.execute(total_statement).fetchall())
            
            # Active failures (still in retry period)
            active_statement = select(self.match_failures).where(
                self.match_failures.c.next_retry > datetime.datetime.now())
            active_failures = len(connection.execute(active_statement).fetchall())
            
            # Most common errors
            error_statement = select(self.match_failures.c.last_error).where(
                self.match_failures.c.last_error.isnot(None))
            errors = [row.last_error for row in connection.execute(error_statement).fetchall()]
            
            return {
                'total_failures_in_period': total_failures,
                'active_failures': active_failures,
                'common_errors': list(set(errors))[:10],  # Top 10 unique errors
                'period_days': days
            }

    # === TRANSFER REPORT METHODS ===
    
    def create_transfer_report(self, transfer_id: str, platform: str, 
                             total_songs: int = 0, total_albums: int = 0, total_playlists: int = 0):
        """Create a new transfer report."""
        with self.engine.connect() as connection:
            with connection.begin():
                connection.execute(insert(self.transfer_reports), {
                    'transfer_id': transfer_id,
                    'platform': platform,
                    'created_at': datetime.datetime.now(),
                    'total_songs': total_songs,
                    'total_albums': total_albums,
                    'total_playlists': total_playlists,
                    'status': 'running'
                })

    def update_transfer_failures(self, transfer_id: str, 
                               failed_songs: List[str] = None,
                               failed_albums: List[str] = None, 
                               failed_playlists: Dict[str, List[str]] = None):
        """Update failure information for a transfer."""
        update_data = {}
        
        if failed_songs is not None:
            update_data['failed_songs'] = json.dumps(failed_songs)
        if failed_albums is not None:
            update_data['failed_albums'] = json.dumps(failed_albums)
        if failed_playlists is not None:
            update_data['failed_playlists'] = json.dumps(failed_playlists)
            
        if update_data:
            with self.engine.connect() as connection:
                with connection.begin():
                    statement = update(self.transfer_reports).where(
                        self.transfer_reports.c.transfer_id == transfer_id
                    ).values(**update_data)
                    connection.execute(statement)

    def complete_transfer_report(self, transfer_id: str, status: str = 'completed'):
        """Mark a transfer as completed."""
        with self.engine.connect() as connection:
            with connection.begin():
                statement = update(self.transfer_reports).where(
                    self.transfer_reports.c.transfer_id == transfer_id
                ).values(
                    completed_at=datetime.datetime.now(),
                    status=status
                )
                connection.execute(statement)

    def get_transfer_report(self, transfer_id: str) -> Optional[Dict]:
        """Get a transfer report by ID."""
        statement = select(self.transfer_reports).where(
            self.transfer_reports.c.transfer_id == transfer_id)
        
        with self.engine.connect() as connection:
            result = connection.execute(statement).fetchone()
            if result:
                return {
                    'transfer_id': result.transfer_id,
                    'platform': result.platform,
                    'created_at': result.created_at,
                    'completed_at': result.completed_at,
                    'total_songs': result.total_songs,
                    'total_albums': result.total_albums,
                    'total_playlists': result.total_playlists,
                    'failed_songs': json.loads(result.failed_songs),
                    'failed_albums': json.loads(result.failed_albums),
                    'failed_playlists': json.loads(result.failed_playlists),
                    'status': result.status,
                    'total_failures': len(json.loads(result.failed_songs)) + 
                                    len(json.loads(result.failed_albums)) + 
                                    sum(len(tracks) for tracks in json.loads(result.failed_playlists).values())
                }
            return None

    def cleanup_old_reports(self, days: int = 30):
        """Clean up transfer reports older than N days."""
        cutoff_date = datetime.datetime.now() - datetime.timedelta(days=days)
        
        with self.engine.connect() as connection:
            with connection.begin():
                statement = delete(self.transfer_reports).where(
                    self.transfer_reports.c.created_at < cutoff_date)
                result = connection.execute(statement)
                return result.rowcount

    # === STATISTICS METHODS ===
    
    def record_transfer_stats(self, platform: str, 
                            tracks_attempted: int = 0, tracks_successful: int = 0,
                            albums_attempted: int = 0, albums_successful: int = 0,
                            playlists_attempted: int = 0, playlists_successful: int = 0):
        """Record transfer statistics."""
        with self.engine.connect() as connection:
            with connection.begin():
                connection.execute(insert(self.transfer_stats), {
                    'platform': platform,
                    'date': datetime.datetime.now(),
                    'tracks_attempted': tracks_attempted,
                    'tracks_successful': tracks_successful,
                    'albums_attempted': albums_attempted,
                    'albums_successful': albums_successful,
                    'playlists_attempted': playlists_attempted,
                    'playlists_successful': playlists_successful
                })

    def get_success_rates(self, platform: str = None, days: int = 30) -> Dict:
        """Get success rates for transfers."""
        cutoff_date = datetime.datetime.now() - datetime.timedelta(days=days)
        base_statement = select(self.transfer_stats).where(
            self.transfer_stats.c.date >= cutoff_date)
        
        if platform:
            base_statement = base_statement.where(self.transfer_stats.c.platform == platform)
        
        with self.engine.connect() as connection:
            results = connection.execute(base_statement).fetchall()
            
            if not results:
                return {'no_data': True}
            
            totals = {
                'tracks_attempted': sum(r.tracks_attempted for r in results),
                'tracks_successful': sum(r.tracks_successful for r in results),
                'albums_attempted': sum(r.albums_attempted for r in results),
                'albums_successful': sum(r.albums_successful for r in results),
                'playlists_attempted': sum(r.playlists_attempted for r in results),
                'playlists_successful': sum(r.playlists_successful for r in results),
            }
            
            return {
                'platform': platform or 'all',
                'period_days': days,
                'tracks_success_rate': totals['tracks_successful'] / max(totals['tracks_attempted'], 1) * 100,
                'albums_success_rate': totals['albums_successful'] / max(totals['albums_attempted'], 1) * 100,
                'playlists_success_rate': totals['playlists_successful'] / max(totals['playlists_attempted'], 1) * 100,
                **totals
            }


class TrackMatchCache:
    """
    Enhanced non-persistent mapping of spotify ids -> tidal_ids
    Now includes statistics and batch operations
    This should NOT be accessed concurrently from multiple processes
    """
    
    def __init__(self):
        self.data: Dict[str, int] = {}
        self.stats = {
            'hits': 0,
            'misses': 0,
            'inserts': 0
        }

    def get(self, track_id: str) -> int | None:
        """Get cached track match with statistics."""
        result = self.data.get(track_id, None)
        if result:
            self.stats['hits'] += 1
        else:
            self.stats['misses'] += 1
        return result

    def insert(self, mapping: tuple[str, int]):
        """Insert track match mapping."""
        self.data[mapping[0]] = mapping[1]
        self.stats['inserts'] += 1

    def batch_insert(self, mappings: List[Tuple[str, int]]):
        """Insert multiple mappings at once."""
        for mapping in mappings:
            self.insert(mapping)

    def remove(self, track_id: str) -> bool:
        """Remove a track from cache."""
        if track_id in self.data:
            del self.data[track_id]
            return True
        return False

    def get_stats(self) -> Dict:
        """Get cache statistics."""
        total_requests = self.stats['hits'] + self.stats['misses']
        hit_rate = self.stats['hits'] / max(total_requests, 1) * 100
        
        return {
            **self.stats,
            'total_cached': len(self.data),
            'hit_rate_percent': hit_rate
        }

    def clear(self):
        """Clear all cached data."""
        self.data.clear()
        self.stats = {'hits': 0, 'misses': 0, 'inserts': 0}

    def get_cached_failures(self, track_ids: List[str]) -> List[str]:
        """Get list of track IDs that are not in cache (potential failures)."""
        return [track_id for track_id in track_ids if track_id not in self.data]

    def has_match(self, track_id: str) -> bool:
        """Check if track has a cached match without updating stats."""
        return track_id in self.data


# Enhanced singleton instances with better initialization
failure_cache = MatchFailureDatabase()
track_match_cache = TrackMatchCache()

# Utility functions for easy access
def get_cache_summary() -> Dict:
    """Get a summary of all cache statistics."""
    return {
        'track_cache': track_match_cache.get_stats(),
        'failure_stats': failure_cache.get_failure_statistics(),
        'timestamp': datetime.datetime.now().isoformat()
    }

def cleanup_caches(days: int = 30) -> Dict:
    """Clean up old data from all caches."""
    reports_cleaned = failure_cache.cleanup_old_reports(days)
    return {
        'reports_cleaned': reports_cleaned,
        'cleanup_date': datetime.datetime.now().isoformat(),
        'days_retained': days
    }