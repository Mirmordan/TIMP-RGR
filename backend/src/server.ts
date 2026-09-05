import app from './app';
import { config } from './config';
import { recoveryService } from './services/recovery.service';

app.listen(config.port, () => {
  console.log(`Сервер запущен на ${config.appAddress}:${config.port}`);
  // Реконсиляция «висящих» записей после аварийного рестарта — не блокирует bind.
  void recoveryService.reconcileOnStartup();
  // Watchdog «живости» записей: первый тик через WATCHDOG_TICK_S после bind —
  // не долбит медиа-сервисы сразу после рестарта.
  recoveryService.startWatchdog();
});
