"""
Health check endpoint for monitoring and load balancer checks.
"""

from flask import Blueprint, jsonify, Response
from sqlalchemy import text

from src.models.base import get_db_session
from src.utils.logger import logger
from src.config.settings import get_settings

health_bp = Blueprint('health', __name__)


@health_bp.route('/health', methods=['GET'])
def health_check() -> Response:
    """
    Health check endpoint.

    Returns:
        JSON response with health status
    """
    settings = get_settings()
    health_status = {
        'status': 'healthy',
        'service': settings.service_name,
        'checks': {}
    }

    # Check database connection
    try:
        db = get_db_session()
        db.execute(text('SELECT 1'))
        db.close()
        health_status['checks']['database'] = 'healthy'
    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        health_status['checks']['database'] = 'unhealthy'
        health_status['status'] = 'degraded'

    # Check Redis connection (simple import check for now)
    try:
        from redis import Redis
        redis_client = Redis.from_url(settings.redis_url, socket_connect_timeout=2)
        redis_client.ping()
        health_status['checks']['redis'] = 'healthy'
    except Exception as e:
        logger.error(f"Redis health check failed: {str(e)}")
        health_status['checks']['redis'] = 'unhealthy'
        health_status['status'] = 'degraded'

    # Return appropriate status code
    status_code = 200 if health_status['status'] == 'healthy' else 503

    return jsonify(health_status), status_code
