export interface NotificationSettings {
  id: string;
  user_id: string;
  notify_days_before: number;
  email_notifications: boolean;
  push_notifications: boolean;
  budget_monthly: number | null;
  /** 예산 초과 알림을 받을지. 예산은 두되 알림만 끌 수 있다. */
  budget_alerts: boolean;
  /** 외화 구독의 환율 급등 알림을 받을지. */
  fx_alerts: boolean;
  /** 푸시를 받을 기기가 연결돼 있는지 (앱에 로그인하면 연결된다) */
  push_device_connected?: boolean;
}

export interface NotificationSettingsUpdate {
  notify_days_before?: number;
  email_notifications?: boolean;
  push_notifications?: boolean;
  budget_monthly?: number | null;
  budget_alerts?: boolean;
  fx_alerts?: boolean;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  category: string | null;
  link: string | null;
  image_url: string | null;
  action_url: string | null;
  action_label: string | null;
  is_read: boolean;
  created_at: string;
}

export interface InboxResponse {
  items: NotificationItem[];
  unread_count: number;
}
