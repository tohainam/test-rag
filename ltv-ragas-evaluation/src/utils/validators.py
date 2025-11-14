"""
Validation utilities for file uploads and data validation.
"""

from typing import Literal

# Allowed file extensions and their MIME types
ALLOWED_FILE_TYPES = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
}

# Maximum file size in bytes (100MB)
MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100MB


def validate_file_extension(filename: str) -> tuple[bool, str | None]:
    """
    Validate if file extension is allowed.

    Args:
        filename: Name of the file

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not filename:
        return False, "Filename is required"

    # Get file extension
    if '.' not in filename:
        return False, "File must have an extension"

    extension = '.' + filename.rsplit('.', 1)[1].lower()

    if extension not in ALLOWED_FILE_TYPES:
        allowed = ', '.join(ALLOWED_FILE_TYPES.keys())
        return False, f"File type not allowed. Allowed types: {allowed}"

    return True, None


def validate_file_size(file_size: int) -> tuple[bool, str | None]:
    """
    Validate if file size is within limits.

    Args:
        file_size: Size of the file in bytes

    Returns:
        Tuple of (is_valid, error_message)
    """
    if file_size <= 0:
        return False, "File size must be greater than 0"

    if file_size > MAX_FILE_SIZE_BYTES:
        max_mb = MAX_FILE_SIZE_BYTES / (1024 * 1024)
        return False, f"File size exceeds maximum limit of {max_mb:.0f}MB"

    return True, None


def get_content_type(filename: str) -> str | None:
    """
    Get the content type for a filename based on extension.

    Args:
        filename: Name of the file

    Returns:
        Content type string or None if extension not recognized
    """
    if '.' not in filename:
        return None

    extension = '.' + filename.rsplit('.', 1)[1].lower()
    return ALLOWED_FILE_TYPES.get(extension)


def validate_dataset_source(source: str) -> tuple[bool, str | None]:
    """
    Validate dataset source value.

    Args:
        source: Source type

    Returns:
        Tuple of (is_valid, error_message)
    """
    valid_sources = ['manual', 'llm_generated']

    if source not in valid_sources:
        return False, f"Invalid source. Must be one of: {', '.join(valid_sources)}"

    return True, None


def validate_order_indices(indices: list[int]) -> tuple[bool, str | None]:
    """
    Validate that order indices are sequential and have no duplicates.

    Args:
        indices: List of order indices

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not indices:
        return True, None

    # Check for duplicates
    if len(indices) != len(set(indices)):
        return False, "Order indices must be unique (no duplicates)"

    # Check if sequential starting from 0
    sorted_indices = sorted(indices)
    expected = list(range(len(indices)))

    if sorted_indices != expected:
        return False, f"Order indices must be sequential starting from 0. Expected: {expected}, Got: {sorted_indices}"

    return True, None
