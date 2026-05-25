import { NotificationChannel, NotificationStatus } from '@prisma/client';
import nodemailer from 'nodemailer';

import {
  type NotificationDeliveryAdapter,
  type NotificationDeliveryContext,
  type NotificationDeliveryResult,
} from './notification-delivery.adapter';

export type EmailNotificationDeliveryOptions = {
  provider?: string;
  from?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  zeptoMailTokenConfigured?: boolean;
};

export class EmailNotificationDeliveryAdapter implements NotificationDeliveryAdapter {
  readonly channel = NotificationChannel.EMAIL;

  constructor(private readonly options: EmailNotificationDeliveryOptions) {}

  async deliver(context: NotificationDeliveryContext): Promise<NotificationDeliveryResult> {
    if (!context.recipient.destination) {
      return {
        status: NotificationStatus.FAILED,
        failureReason: 'Email notifications require a recipient destination.',
      };
    }

    if (!this.isConfigured()) {
      return {
        status: NotificationStatus.FAILED,
        failureReason: 'Email provider is not configured.',
      };
    }

    try {
      const transport = nodemailer.createTransport({
        host: this.options.host,
        port: this.options.port,
        secure: this.options.secure ?? false,
        auth: this.options.user
          ? {
              user: this.options.user,
              pass: this.options.pass,
            }
          : undefined,
      });
      const delivery = await transport.sendMail({
        from: this.options.from,
        to: context.recipient.destination,
        subject: context.notification.title,
        text: context.notification.body,
        html: this.toHtml(context.notification.body),
      });

      return {
        status: NotificationStatus.SENT,
        providerMessageId: delivery.messageId,
        metadata: {
          provider: this.options.provider ?? 'smtp',
          strategy: 'smtp',
          from: this.options.from,
          host: this.options.host,
          port: this.options.port,
          secure: this.options.secure,
        },
      };
    } catch (error) {
      return {
        status: NotificationStatus.FAILED,
        failureReason: error instanceof Error ? error.message : 'Email delivery failed.',
      };
    }
  }

  private isConfigured() {
    return Boolean(
      this.options.zeptoMailTokenConfigured ||
        (this.options.host && this.options.port && this.options.from),
    );
  }

  private toHtml(body: string) {
    return body
      .split(/\n{2,}/g)
      .map((paragraph) => `<p>${this.escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
      .join('');
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
