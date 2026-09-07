import { Router } from 'express';
import type { Request, Response } from 'express';
import { objectRepository } from '../repositories/object.repository';
import { authenticate } from '../security/middleware/authenticate';
import { requirePermission } from '../security/middleware/requirePermission';

export const objectRouter = Router();

objectRouter.use(authenticate);

/**
 * @openapi
 * /objects/{id}:
 *   get:
 *     tags: [Objects]
 *     operationId: getObjectMeta
 *     summary: Объект с общими метаданными
 *     description: Возвращает объект любого типа с эффективным названием, описанием и родителем (objects). Требуется право read на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID объекта (objects.id).
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Метаданные объекта
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ObjectMeta'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Нет доступа к объекту
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Объект не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
objectRouter.get('/:id', requirePermission('read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const obj = await objectRepository.findById(id);
  if (!obj) return res.status(404).json({ error: 'объект не найден' });
  res.json(obj);
});

/**
 * @openapi
 * /objects/{id}/metadata:
 *   patch:
 *     tags: [Objects]
 *     operationId: patchObjectMetadata
 *     summary: Обновление общих метаданных объекта
 *     description: Обновляет name/description объекта любого типа. name null/'' сбрасывает override (для потоков/записей — наследование родителя); для устройства очистка имени запрещена. description null/'' очищает. Требуется право write на объект.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: UUID объекта (objects.id).
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ObjectMetadataPatch'
 *     responses:
 *       '200':
 *         description: Обновлённые метаданные объекта
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ObjectMeta'
 *       '400':
 *         description: Некорректные данные (например, пустое имя устройства)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '401':
 *         description: Требуется авторизация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '403':
 *         description: Нет доступа к объекту
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '404':
 *         description: Объект не найден
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
objectRouter.patch('/:id/metadata', requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, description } = req.body;
    const updated = await objectRepository.patchMetadata(id, { name, description });
    if (!updated) return res.status(404).json({ error: 'объект не найден' });
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
