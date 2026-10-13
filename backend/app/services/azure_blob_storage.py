"""Azure Blob Storage helpers for sniper application."""

from __future__ import annotations

import logging
from pathlib import PurePosixPath
import re

logger = logging.getLogger(__name__)

_ALLOWED_BILL_CT = {
    "application/pdf",
    "image/avif",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}

_BILL_EXT_BY_CT = {
    "application/pdf": ".pdf",
    "image/avif": ".avif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def upload_bill_file(
    *,
    file_bytes: bytes,
    content_type: str | None,
    filename: str | None,
    expense_id: int,
    fund_account: str,
    bill_index: int = 1,
    container_name: str = "sniper-account-bills",
    folder_name: str = "sniper-account-bills",
    max_bytes: int = 20 * 1024 * 1024,
) -> str:
    """
    Upload a bill file (PDF or image) to Azure Blob Storage and return the blob URL.

    Parameters
    ----------
    file_bytes:     Raw file content.
    content_type:   MIME type sent by the client.
    filename:       Original file name (used to derive extension as fallback).
    expense_id:     Expense ID for naming.
    fund_account:   Fund account value for naming.
    bill_index:     Sequential bill number (default: 1).
    container_name: Target Azure Blob container (default: sniper-account-bills).
    folder_name:    Virtual folder inside the container (default: sniper-account-bills).
    max_bytes:      Maximum allowed file size in bytes (default: 20 MB).

    Raises
    ------
    ValueError: For configuration issues, file too large, or unsupported type.
    """
    from app.core.config import get_settings

    settings = get_settings()
    resolved_container_name = container_name or "sniper-account-bills"
    base_url = (settings.azure_storage_base_url or "").strip().strip("/")
    conn = (settings.azure_storage_connection_string or "").strip()

    # Fall back to building the connection string from account name + key
    if not conn:
        account_name = (settings.azure_storage_account_name or "").strip()
        account_key = (settings.azure_storage_account_key or "").strip()
        if account_name and account_key:
            conn = (
                f"DefaultEndpointsProtocol=https;"
                f"AccountName={account_name};"
                f"AccountKey={account_key};"
                f"EndpointSuffix=core.windows.net"
            )

    if not conn:
        raise ValueError("Azure Storage is not configured (set AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY in .env).")

    if not file_bytes:
        raise ValueError("Uploaded file is empty.")

    if len(file_bytes) > max_bytes:
        raise ValueError(f"File too large (max {max_bytes // (1024 * 1024)} MB).")

    ct = (content_type or "").split(";")[0].strip().lower() or ""

    # Derive extension from filename if content-type is missing/unknown
    ext = ""
    if filename:
        suf = PurePosixPath(filename).suffix.lower()
        if suf == ".jpeg":
            suf = ".jpg"
        ext = suf

    if not ext:
        ext = _BILL_EXT_BY_CT.get(ct, "")

    if ct not in _ALLOWED_BILL_CT and ext not in _BILL_EXT_BY_CT.values():
        raise ValueError(
            "Unsupported file type. Allowed: PDF, AVIF, JPEG, PNG, WEBP, GIF."
        )

    safe_fund_account = re.sub(r"[^A-Za-z0-9_-]+", "-", (fund_account or "").strip()).strip("-")
    if not safe_fund_account:
        raise ValueError("Invalid fund_account value for blob filename.")

    final_ext = ext or _BILL_EXT_BY_CT.get(ct, ".bin")
    safe_folder = folder_name.strip().strip("/")
    blob_name = f"{safe_folder}/{expense_id}_{safe_fund_account}_bill{bill_index}{final_ext}"

    logger.info(f"Uploading blob: {blob_name} (size={len(file_bytes)} bytes, content_type={ct})")

    try:
        from azure.core.exceptions import ResourceExistsError
        from azure.storage.blob import BlobServiceClient, ContentSettings
    except ImportError as exc:  # pragma: no cover
        raise ValueError("azure-storage-blob package is not installed.") from exc

    bsc = BlobServiceClient.from_connection_string(conn)
    container_client = bsc.get_container_client(resolved_container_name)
    try:
        container_client.create_container()
    except ResourceExistsError:
        pass

    blob = container_client.get_blob_client(blob_name)
    try:
        logger.info(f"Starting upload of blob: {blob_name}")
        blob.upload_blob(
            file_bytes,
            overwrite=True,
            content_settings=ContentSettings(content_type=ct or "application/octet-stream"),
        )
        logger.info(f"Blob upload completed: {blob_name}")
    except Exception as exc:
        logger.error(f"Blob upload failed for {blob_name}: {str(exc)}")
        raise ValueError(f"Failed to upload blob '{blob_name}': {str(exc)}") from exc

    # Verify the blob exists after upload
    try:
        props = blob.get_blob_properties()
        logger.info(f"Blob verification successful: {blob_name} (size={props.size} bytes)")
    except Exception as exc:
        logger.error(f"Blob verification failed for {blob_name}: {str(exc)}")
        raise ValueError(f"Blob upload succeeded but verification failed for '{blob_name}': {str(exc)}") from exc

    if base_url:
        url = f"{base_url}/{resolved_container_name}/{blob_name}"
        logger.info(f"Returning blob URL: {url}")
        return url

    url = str(blob.url)
    logger.info(f"Returning blob URL: {url}")
    return url
