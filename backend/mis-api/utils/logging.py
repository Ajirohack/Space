import logging
import sys
import json
import asyncio
from pathlib import Path
from datetime import datetime
from logging.handlers import RotatingFileHandler, QueueHandler, QueueListener
from queue import Queue
from typing import Any, Dict, Optional
from contextlib import contextmanager

class JsonFormatter(logging.Formatter):
    """Format logs as JSON for better parsing"""
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            'timestamp': self.formatTime(record),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'path': record.pathname,
            'line': record.lineno,
            'thread': record.threadName,
            'process': record.process
        }

        # Add task info for async context
        try:
            task = asyncio.current_task()
            if task:
                log_data['task_name'] = task.get_name()
                log_data['task_id'] = id(task)
        except RuntimeError:
            # Not in async context
            pass

        # Add exception info if present
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)

        # Add any extra fields
        if hasattr(record, 'extra_data'):
            log_data.update(record.extra_data)

        return json.dumps(log_data)

def setup_logging():
    # Create logs directory if it doesn't exist
    log_dir = Path(__file__).parent.parent / 'logs'
    log_dir.mkdir(exist_ok=True)

    # Get current date for log files
    current_date = datetime.now().strftime('%Y%m%d')

    # Configure formatters
    json_formatter = logging.Formatter(
        '{"timestamp":"%(asctime)s", "level":"%(levelname)s", "message":%(message)s}'
    )
    standard_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    # Configure handlers with rotation
    api_handler = logging.FileHandler(f'{log_dir}/api-{current_date}.log')
    api_handler.setFormatter(json_formatter)
    
    error_handler = logging.FileHandler(f'{log_dir}/error-{current_date}.log')
    error_handler.setFormatter(json_formatter)
    error_handler.setLevel(logging.ERROR)
    
    security_handler = logging.FileHandler(f'{log_dir}/security-{current_date}.log')
    security_handler.setFormatter(json_formatter)
    
    websocket_handler = logging.FileHandler(f'{log_dir}/websocket-{current_date}.log')
    websocket_handler.setFormatter(json_formatter)

    # Configure loggers
    api_logger = logging.getLogger('api')
    api_logger.setLevel(logging.INFO)
    api_logger.addHandler(api_handler)
    api_logger.addHandler(error_handler)

    security_logger = logging.getLogger('security')
    security_logger.setLevel(logging.INFO)
    security_logger.addHandler(security_handler)
    security_logger.addHandler(error_handler)

    ws_logger = logging.getLogger('websocket')
    ws_logger.setLevel(logging.INFO)
    ws_logger.addHandler(websocket_handler)
    ws_logger.addHandler(error_handler)

def log_api_request(
    method: str,
    path: str,
    status_code: int,
    duration_ms: float,
    user_id: Optional[str] = None,
    query_params: Optional[Dict[str, Any]] = None,
    client_ip: Optional[str] = None
) -> None:
    """Log API request details in JSON format"""
    logger = logging.getLogger('api')
    
    log_data = {
        'method': method,
        'path': path,
        'status_code': status_code,
        'duration_ms': round(duration_ms, 2),
        'user_id': user_id,
        'query_params': query_params,
        'client_ip': client_ip
    }
    
    # Remove None values for cleaner logs
    log_data = {k: v for k, v in log_data.items() if v is not None}
    
    logger.info(json.dumps(log_data))

def log_security_event(
    event_type: str,
    details: Dict[str, Any],
    client_ip: Optional[str] = None,
    user_id: Optional[str] = None
) -> None:
    """Log security-related events"""
    logger = logging.getLogger('security')
    
    log_data = {
        'event_type': event_type,
        'details': details,
        'client_ip': client_ip,
        'user_id': user_id
    }
    
    log_data = {k: v for k, v in log_data.items() if v is not None}
    
    logger.info(json.dumps(log_data))

def log_websocket_event(
    event_type: str,
    client_id: str,
    details: Optional[Dict[str, Any]] = None,
    user_id: Optional[str] = None
) -> None:
    """Log WebSocket events"""
    logger = logging.getLogger('websocket')
    
    log_data = {
        'event_type': event_type,
        'client_id': client_id,
        'details': details,
        'user_id': user_id
    }
    
    log_data = {k: v for k, v in log_data.items() if v is not None}
    
    logger.info(json.dumps(log_data))

@contextmanager
def log_context(**kwargs):
    """Context manager to add context to log records"""
    frame = sys._getframe(1)
    old_extra = getattr(frame, 'f_locals', {}).get('extra', {})
    frame.f_locals['extra'] = {**old_extra, **kwargs}
    try:
        yield
    finally:
        frame.f_locals['extra'] = old_extra