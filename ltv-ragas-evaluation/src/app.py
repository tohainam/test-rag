"""
Flask application for RAGAS Evaluation System.
"""

from flask import Flask, jsonify, Response
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from src.config.settings import get_settings
from src.utils.logger import logger
from src.routes.health import health_bp
from src.routes.files import files_bp
from src.routes.datasets import datasets_bp
from src.routes.questions import questions_bp
from src.routes.jobs import jobs_bp
from src.routes.dashboard import dashboard_bp
from src.routes.generation_jobs import generation_jobs_bp


def create_app() -> Flask:
    """
    Create and configure the Flask application.

    Returns:
        Configured Flask application instance
    """
    settings = get_settings()

    # Create Flask app
    app = Flask(__name__)

    # Configure app
    app.config['JSON_SORT_KEYS'] = False
    app.config['DEBUG'] = settings.is_development
    app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size

    # Setup CORS
    CORS(app, resources={
        r"/*": {
            "origins": "*",  # TODO: Restrict in production
            "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "X-Gateway-Auth", "X-User-Id", "X-User-Email", "X-User-Role"]
        }
    })

    # Register blueprints
    app.register_blueprint(health_bp)
    app.register_blueprint(files_bp)
    app.register_blueprint(datasets_bp)
    app.register_blueprint(questions_bp)
    app.register_blueprint(jobs_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(generation_jobs_bp)

    # Error handlers
    @app.errorhandler(404)
    def not_found(error: Exception) -> tuple[Response, int]:
        """Handle 404 errors."""
        logger.warning(f"404 Not Found: {error}")
        return jsonify({
            'error': 'Not Found',
            'message': 'The requested endpoint does not exist'
        }), 404

    @app.errorhandler(500)
    def internal_error(error: Exception) -> tuple[Response, int]:
        """Handle 500 errors."""
        logger.error(f"500 Internal Server Error: {error}", exc_info=True)
        return jsonify({
            'error': 'Internal Server Error',
            'message': 'An unexpected error occurred'
        }), 500

    @app.errorhandler(HTTPException)
    def handle_http_exception(error: HTTPException) -> tuple[Response, int]:
        """Handle all HTTP exceptions."""
        logger.warning(f"{error.code} {error.name}: {error.description}")
        return jsonify({
            'error': error.name,
            'message': error.description
        }), error.code or 500

    @app.errorhandler(Exception)
    def handle_generic_exception(error: Exception) -> tuple[Response, int]:
        """Handle all uncaught exceptions."""
        logger.error(f"Uncaught exception: {error}", exc_info=True)
        return jsonify({
            'error': 'Internal Server Error',
            'message': 'An unexpected error occurred'
        }), 500

    # Request logging middleware
    @app.before_request
    def log_request() -> None:
        """Log all incoming requests."""
        from flask import request
        logger.info(f"{request.method} {request.path}", extra={
            'method': request.method,
            'path': request.path,
            'user_id': request.headers.get('X-User-Id'),
            'user_role': request.headers.get('X-User-Role')
        })

    @app.after_request
    def log_response(response: Response) -> Response:
        """Log all responses."""
        from flask import request
        logger.info(f"{request.method} {request.path} {response.status_code}", extra={
            'method': request.method,
            'path': request.path,
            'status_code': response.status_code
        })
        return response

    return app


def main() -> None:
    """Main entry point for running the Flask application."""
    settings = get_settings()

    logger.info(f"Starting {settings.service_name} on port {settings.port}")
    logger.info(f"Environment: {settings.flask_env}")

    app = create_app()
    app.run(
        host='0.0.0.0',
        port=settings.port,
        debug=settings.is_development
    )


if __name__ == '__main__':
    main()
