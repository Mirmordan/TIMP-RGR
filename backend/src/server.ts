import app from './app';
import { config } from './config';
import { recoveryService } from './services/recovery.service';
import { ownerService } from './services/owner.service';

app.listen(config.port, () => {
  console.log(`Сервер запущен на ${config.appAddress}:${config.port}`);
  // Bootstrap защищённого owner-аккаунта — не блокирует bind, не роняет старт.
  void ownerService.ensureOwner();
  // Реконсиляция «висящих» записей после аварийного рестарта — не блокирует bind.
  void recoveryService.reconcileOnStartup();
  // Watchdog «живости» записей: первый тик через WATCHDOG_TICK_S после bind —
  // не долбит медиа-сервисы сразу после рестарта.
  recoveryService.startWatchdog();
});
