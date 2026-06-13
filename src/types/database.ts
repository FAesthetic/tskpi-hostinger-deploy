export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          email: string | null;
          global_role: Database["public"]["Enums"]["global_role"];
          access_status: "pending" | "approved" | "blocked";
          requested_shop_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          global_role?: Database["public"]["Enums"]["global_role"];
          access_status?: "pending" | "approved" | "blocked";
          requested_shop_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          global_role?: Database["public"]["Enums"]["global_role"];
          access_status?: "pending" | "approved" | "blocked";
          requested_shop_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      shops: {
        Row: {
          id: string;
          name: string;
          slug: string;
          location: string | null;
          is_active: boolean;
          is_primary: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          location?: string | null;
          is_active?: boolean;
          is_primary?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          location?: string | null;
          is_active?: boolean;
          is_primary?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      shop_memberships: {
        Row: {
          id: string;
          shop_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["shop_role"];
          status: Database["public"]["Enums"]["member_status"];
          invited_by: string | null;
          can_view_employees: boolean;
          can_view_portings: boolean;
          can_view_analysis: boolean;
          can_view_kpi_table: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          user_id: string;
          role?: Database["public"]["Enums"]["shop_role"];
          status?: Database["public"]["Enums"]["member_status"];
          invited_by?: string | null;
          can_view_employees?: boolean;
          can_view_portings?: boolean;
          can_view_analysis?: boolean;
          can_view_kpi_table?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          user_id?: string;
          role?: Database["public"]["Enums"]["shop_role"];
          status?: Database["public"]["Enums"]["member_status"];
          invited_by?: string | null;
          can_view_employees?: boolean;
          can_view_portings?: boolean;
          can_view_analysis?: boolean;
          can_view_kpi_table?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      kpi_definitions: {
        Row: {
          id: string;
          code: string;
          name: string;
          category: Database["public"]["Enums"]["kpi_category"];
          value_type: Database["public"]["Enums"]["kpi_value_type"];
          unit: string;
          sort_order: number;
          status: Database["public"]["Enums"]["kpi_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          category: Database["public"]["Enums"]["kpi_category"];
          value_type: Database["public"]["Enums"]["kpi_value_type"];
          unit: string;
          sort_order?: number;
          status?: Database["public"]["Enums"]["kpi_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          category?: Database["public"]["Enums"]["kpi_category"];
          value_type?: Database["public"]["Enums"]["kpi_value_type"];
          unit?: string;
          sort_order?: number;
          status?: Database["public"]["Enums"]["kpi_status"];
          created_at?: string;
          updated_at?: string;
        };
      };
      quarterly_targets: {
        Row: {
          id: string;
          shop_id: string;
          kpi_definition_id: string;
          year: number;
          quarter: number;
          target_value: number;
          note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          kpi_definition_id: string;
          year: number;
          quarter: number;
          target_value?: number;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          kpi_definition_id?: string;
          year?: number;
          quarter?: number;
          target_value?: number;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      daily_kpi_entries: {
        Row: {
          id: string;
          shop_id: string;
          kpi_definition_id: string;
          entry_date: string;
          value: number;
          note: string | null;
          source: string;
          source_ref_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          kpi_definition_id: string;
          entry_date: string;
          value?: number;
          note?: string | null;
          source?: string;
          source_ref_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          kpi_definition_id?: string;
          entry_date?: string;
          value?: number;
          note?: string | null;
          source?: string;
          source_ref_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      notification_events: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          event_type: string;
          id: string;
          payload: Json;
          processed_at: string | null;
          shop_id: string | null;
        };
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          payload?: Json;
          processed_at?: string | null;
          shop_id?: string | null;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          payload?: Json;
          processed_at?: string | null;
          shop_id?: string | null;
        };
      };
      tnps_entries: GenericShopTable;
      tariffs: GenericShopTable;
      portings: GenericShopTable;
      porting_kpi_impacts: GenericShopTable;
      employees: GenericShopTable;
      sick_days: GenericShopTable;
      special_opening_days: GenericShopTable;
      special_closing_days: GenericShopTable;
      audit_logs: {
        Row: {
          id: number;
          shop_id: string | null;
          actor_user_id: string | null;
          action: string;
          target_table: string | null;
          target_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: never;
          shop_id?: string | null;
          actor_user_id?: string | null;
          action: string;
          target_table?: string | null;
          target_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: never;
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_shop: {
        Args: {
          shop_name: string;
          shop_slug: string;
          shop_location?: string | null;
        };
        Returns: Database["public"]["Tables"]["shops"]["Row"];
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      current_shop_role: {
        Args: {
          target_shop_id: string;
        };
        Returns: Database["public"]["Enums"]["shop_role"] | null;
      };
      has_shop_role: {
        Args: {
          target_shop_id: string;
          allowed_roles: Database["public"]["Enums"]["shop_role"][];
        };
        Returns: boolean;
      };
      can_view_shop: {
        Args: {
          target_shop_id: string;
        };
        Returns: boolean;
      };
      can_manage_shop: {
        Args: {
          target_shop_id: string;
        };
        Returns: boolean;
      };
      can_view_employee_data: {
        Args: {
          target_shop_id: string;
        };
        Returns: boolean;
      };
      can_view_portings: {
        Args: {
          target_shop_id: string;
        };
        Returns: boolean;
      };
      can_view_analysis: {
        Args: {
          target_shop_id: string;
        };
        Returns: boolean;
      };
      can_view_kpi_table: {
        Args: {
          target_shop_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      global_role: "admin" | "user";
      shop_role: "shop_lead" | "viewer";
      member_status: "invited" | "active" | "suspended";
      kpi_category: "provision" | "unit" | "quality" | "tnps";
      kpi_value_type: "money" | "count" | "score";
      kpi_status: "draft" | "active" | "archived";
      porting_type: "mobile_pk" | "mobile_gk";
      porting_status: "open" | "planned" | "effective" | "archived";
    };
    CompositeTypes: Record<string, never>;
  };
};

type GenericShopTable = {
  Row: Record<string, unknown> & { id: string; shop_id: string };
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
};
