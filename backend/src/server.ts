import app from './app';
import { config } from './config';

app.listen(config.port, () => {
  console.log(`Сервер запущен на ${config.appAddress}:${config.port}`);
});
