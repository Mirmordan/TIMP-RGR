-- Добавляем поле sourceFingerprint к потокам записи
-- (TLS-отпечаток сертификата источника, нужен для камер с неизвестным CA)
ALTER TABLE recording_streams ADD COLUMN source_fingerprint TEXT;
