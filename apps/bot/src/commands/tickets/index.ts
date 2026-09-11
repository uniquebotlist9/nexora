import type { BotCommand } from '../../framework/types';
import { ticketsCommand } from './tickets';

export const ticketCommands: readonly BotCommand[] = [ticketsCommand];
