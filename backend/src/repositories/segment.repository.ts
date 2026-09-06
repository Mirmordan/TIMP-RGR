import type { RecordingSegment } from '../types';
import { queryAs, inUserContext } from '../security/dbBridge';
import { segmentQueries } from '../database/queries/segment.queries';

export const segmentRepository = {
  async findById(id: string): Promise<RecordingSegment | null> {
    const { rows } = await queryAs<RecordingSegment>(segmentQueries.findById, [id]);
    return rows[0] ?? null;
  },

  async findAll(limit: number, offset: number): Promise<RecordingSegment[]> {
    const { rows } = await queryAs<RecordingSegment>(segmentQueries.findAll, [limit, offset]);
    return rows;
  },

  async count(): Promise<number> {
    const { rows } = await queryAs<{ total: number }>(segmentQueries.count);
    return rows[0]?.total ?? 0;
  },

  async findByTimeRange(from: string, to: string): Promise<RecordingSegment[]> {
    const { rows } = await queryAs<RecordingSegment>(segmentQueries.findByTimeRange, [from, to]);
    return rows;
  },

  async findByProcess(processId: string): Promise<RecordingSegment[]> {
    const { rows } = await queryAs<RecordingSegment>(segmentQueries.findByProcess, [processId]);
    return rows;
  },

  async findByStream(streamId: string): Promise<RecordingSegment[]> {
    const { rows } = await queryAs<RecordingSegment>(segmentQueries.findByStream, [streamId]);
    return rows;
  },

  async create(data: {
    processId: string;
    streamId: string;
    path: string;
    startedAt: Date;
    endedAt: Date | null;
    fileCount: number;
    durationS: number;
    sizeBytes: number;
  }): Promise<RecordingSegment> {
    return inUserContext(async (client) => {
      // Супертип сегмента: type='segment', parent_id = процесс.
      const { rows: objRows } = await client.query<{ objectId: string }>(segmentQueries.insert, [data.processId]);
      const objectId = objRows[0]?.objectId;
      if (!objectId) throw new Error('объект не создан');
      const { rows } = await client.query<RecordingSegment>(segmentQueries.insertSegment, [
        objectId, data.processId, data.streamId, data.path,
        data.startedAt.toISOString(), data.endedAt?.toISOString() ?? null,
        data.fileCount, data.durationS, data.sizeBytes,
      ]);
      return rows[0]!;
    });
  },

  async finalizeById(id: string, endedAt: Date, fileCount: number, durationS: number, sizeBytes: number): Promise<RecordingSegment | null> {
    const { rows } = await queryAs<RecordingSegment>(
      `UPDATE recording_segments
       SET ended_at = $2, file_count = $3, duration_s = $4, size_bytes = $5
       WHERE object_id = $1
       RETURNING object_id AS "id", process_id AS "processId",
                 stream_id AS "streamId", path,
                 started_at AS "startedAt", ended_at AS "endedAt",
                 file_count AS "fileCount", duration_s AS "durationS",
                 size_bytes AS "sizeBytes"`,
      [id, endedAt.toISOString(), fileCount, durationS, sizeBytes],
    );
    return rows[0] ?? null;
  },

  async deleteById(id: string): Promise<boolean> {
    const result = await queryAs(segmentQueries.deleteById, [id]);
    return (result.rowCount ?? 0) > 0;
  },
};
