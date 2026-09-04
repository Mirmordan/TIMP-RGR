import { Router } from 'express';
import type { Request, Response } from 'express';
import { userService } from '../services/user.service';
import { authenticate } from '../security/middleware/authenticate';
import { requireCapability } from '../security/middleware/requireCapability';

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.get('/', requireCapability('user:read'), async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;
  const users = await userService.getAll(limit, offset);
  res.json({ users });
});

userRouter.get('/:id', requireCapability('user:read'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const user = await userService.getById(id);
  if (!user) return res.status(404).json({ error: 'пользователь не найден' });
  res.json(user);
});

userRouter.post('/', requireCapability('user:create'), async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    const user = await userService.create({ username, email, password });
    res.status(201).json(user);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

userRouter.put('/:id', requireCapability('user:update'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { username, email, password } = req.body;
    const user = await userService.put(id, { username, email, password });
    if (!user) return res.status(404).json({ error: 'пользователь не найден' });
    res.json(user);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

userRouter.patch('/:id', requireCapability('user:update'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = await userService.patch(id, req.body);
    if (!user) return res.status(404).json({ error: 'пользователь не найден' });
    res.json(user);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

userRouter.delete('/:id', requireCapability('user:delete'), async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deleted = await userService.deleteById(id);
  if (!deleted) return res.status(404).json({ error: 'пользователь не найден' });
  res.status(204).send();
});
