# Phone Photo Evidence Design

## Goal

Allow daily-update evidence from common phone cameras without weakening private-file validation.

## Supported formats

Daily-update photos accept JPEG/JPG, PNG, WebP, HEIC/HEIF and AVIF. Files remain limited to ten photos per update and 10 MB per photo.

## Design

Files are stored in their original format. The client validates the extension, declared MIME type and binary signature before upload. Private object paths, storage MIME restrictions and the daily-update RPC accept the same format set. Browsers render supported formats inline; HEIC/HEIF remains available through its signed private download when the browser cannot render it.

## Safety and testing

SVG, HTML and executable content remain rejected. Tests cover HEIC, HEIF and AVIF metadata, ISO-BMFF signatures, safe private paths, the evidence picker and database acceptance of a private HEIC evidence object.
