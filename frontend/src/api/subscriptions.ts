import type {
  CalendarEvent,
  Subscription,
  SubscriptionCreateRequest,
  SubscriptionHistoryItem,
  SubscriptionUpdateRequest,
} from "../types/subscription";
import apiClient from "./client";

export const subscriptionApi = {
  getAll: (params?: {
    status?: string;
    category_id?: number;
    sort_by?: string;
    order?: string;
  }) =>
    apiClient
      .get<Subscription[]>("/subscriptions", { params })
      .then((r) => r.data),

  getById: (id: string) =>
    apiClient.get<Subscription>(`/subscriptions/${id}`).then((r) => r.data),

  create: (data: SubscriptionCreateRequest) =>
    apiClient
      .post<Subscription>("/subscriptions", data)
      .then((r) => r.data),

  createFromCatalog: (data: {
    service_id: number;
    plan_id: number;
    start_date: string;
    next_billing_date: string;
    contract_end_date?: string | null;
    rental_item?: string | null;
    rental_item_icon?: string | null;
  }) =>
    apiClient
      .post<Subscription>("/subscriptions/from-catalog", data)
      .then((r) => r.data),

  update: (id: string, data: SubscriptionUpdateRequest) =>
    apiClient
      .put<Subscription>(`/subscriptions/${id}`, data)
      .then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`/subscriptions/${id}`),

  getUpcoming: (days = 7) =>
    apiClient
      .get<Subscription[]>("/subscriptions/upcoming", { params: { days } })
      .then((r) => r.data),

  getCalendarEvents: (): Promise<{ events: CalendarEvent[] }> =>
    apiClient
      .get<{ events: CalendarEvent[] }>("/subscriptions/calendar-events")
      .then((r) => r.data),

  getTimeline: (): Promise<{ events: SubscriptionHistoryItem[] }> =>
    apiClient
      .get<{ events: SubscriptionHistoryItem[] }>("/subscriptions/timeline")
      .then((r) => r.data),

  getHistory: (id: string): Promise<{ events: SubscriptionHistoryItem[] }> =>
    apiClient
      .get<{ events: SubscriptionHistoryItem[] }>(`/subscriptions/${id}/history`)
      .then((r) => r.data),

  exportCsv: (params?: { status?: string }): Promise<Blob> =>
    apiClient
      .get("/subscriptions/export", { params, responseType: "blob" })
      .then((r) => r.data as Blob),
};
