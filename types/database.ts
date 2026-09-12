export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      business_invitations: {
        Row: {
          accepted_at: string | null
          business_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          business_id: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          business_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_invitations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notifications: {
        Row: {
          attempts: number
          business_id: string
          channel: Database["public"]["Enums"]["customer_notification_channel"]
          created_at: string
          id: string
          last_error: string | null
          provider_message_id: string | null
          queue_entry_id: string
          recipient: string
          sent_at: string | null
          status: Database["public"]["Enums"]["customer_notification_status"]
          type: Database["public"]["Enums"]["customer_notification_type"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          business_id: string
          channel?: Database["public"]["Enums"]["customer_notification_channel"]
          created_at?: string
          id?: string
          last_error?: string | null
          provider_message_id?: string | null
          queue_entry_id: string
          recipient: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["customer_notification_status"]
          type: Database["public"]["Enums"]["customer_notification_type"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          business_id?: string
          channel?: Database["public"]["Enums"]["customer_notification_channel"]
          created_at?: string
          id?: string
          last_error?: string | null
          provider_message_id?: string | null
          queue_entry_id?: string
          recipient?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["customer_notification_status"]
          type?: Database["public"]["Enums"]["customer_notification_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notifications_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "queue_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          branding_theme: string
          business_type: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          public_description: string | null
          public_instructions: string | null
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          branding_theme?: string
          business_type: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          public_description?: string | null
          public_instructions?: string | null
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          branding_theme?: string
          business_type?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          public_description?: string | null
          public_instructions?: string | null
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      business_operating_hours: {
        Row: {
          business_id: string
          close_time: string | null
          is_closed: boolean
          open_time: string | null
          weekday: number
        }
        Insert: {
          business_id: string
          close_time?: string | null
          is_closed?: boolean
          open_time?: string | null
          weekday: number
        }
        Update: {
          business_id?: string
          close_time?: string | null
          is_closed?: boolean
          open_time?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_operating_hours_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      queue_entries: {
        Row: {
          access_token_hash: string
          business_id: string
          called_at: string | null
          cancelled_at: string | null
          completed_at: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          email_notifications_enabled: boolean
          id: string
          joined_at: string
          public_id: string
          queue_id: string
          queue_number: number
          serving_at: string | null
          status: Database["public"]["Enums"]["entry_status"]
        }
        Insert: {
          access_token_hash: string
          business_id: string
          called_at?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          email_notifications_enabled?: boolean
          id?: string
          joined_at?: string
          public_id?: string
          queue_id: string
          queue_number: number
          serving_at?: string | null
          status?: Database["public"]["Enums"]["entry_status"]
        }
        Update: {
          access_token_hash?: string
          business_id?: string
          called_at?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          email_notifications_enabled?: boolean
          id?: string
          joined_at?: string
          public_id?: string
          queue_id?: string
          queue_number?: number
          serving_at?: string | null
          status?: Database["public"]["Enums"]["entry_status"]
        }
        Relationships: [
          {
            foreignKeyName: "queue_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      queues: {
        Row: {
          business_id: string
          created_at: string
          current_number: number
          id: string
          max_waiting_customers: number | null
          name: string
          service_id: string
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          current_number?: number
          id?: string
          max_waiting_customers?: number | null
          name: string
          service_id: string
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          current_number?: number
          id?: string
          max_waiting_customers?: number | null
          name?: string
          service_id?: string
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "queues_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queues_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          average_service_minutes: number
          business_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          average_service_minutes: number
          business_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          average_service_minutes?: number
          business_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_business_invitation: {
        Args: { p_token: string }
        Returns: {
          business_id: string
          business_name: string
          role: Database["public"]["Enums"]["member_role"]
        }[]
      }
      cancel_ticket: {
        Args: { p_access_token: string; p_public_id: string }
        Returns: {
          public_id: string
          queue_number: number
          status: Database["public"]["Enums"]["entry_status"]
        }[]
      }
      create_business: {
        Args: {
          p_business_type: string
          p_email?: string
          p_logo_url?: string
          p_name: string
          p_phone?: string
          p_slug: string
        }
        Returns: {
          business_type: string
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          slug: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "businesses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_business_invitation: {
        Args: { p_email: string }
        Returns: {
          email: string
          expires_at: string
          invitation_id: string
          invitation_token: string
        }[]
      }
      generate_access_token: { Args: never; Returns: string }
      get_invitation_preview: {
        Args: { p_token: string }
        Returns: {
          business_name: string
          email: string
          expires_at: string
          status: string
        }[]
      }
      list_business_team: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          membership_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }[]
      }
      list_pending_invitations: {
        Args: never
        Returns: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          revoked_at: string | null
        }[]
      }
      normalize_invite_email: { Args: { p_email: string }; Returns: string }
      remove_staff_member: {
        Args: { p_membership_id: string }
        Returns: boolean
      }
      revoke_business_invitation: {
        Args: { p_invitation_id: string }
        Returns: boolean
      }
      call_next_entry: {
        Args: { p_queue_id: string }
        Returns: {
          called_at: string
          id: string
          public_id: string
          queue_id: string
          queue_number: number
          status: Database["public"]["Enums"]["entry_status"]
        }[]
      }
      get_public_queues: {
        Args: { p_slug: string }
        Returns: {
          average_service_minutes: number
          branding_theme: string
          business_is_open: boolean
          business_name: string
          business_slug: string
          business_timezone: string
          contact_email: string | null
          contact_phone: string | null
          current_number: number
          max_waiting_customers: number | null
          public_description: string | null
          public_instructions: string | null
          queue_id: string
          queue_name: string
          queue_status: Database["public"]["Enums"]["queue_status"]
          service_description: string | null
          service_name: string
          today_close_time: string | null
          today_is_closed: boolean
          today_open_time: string | null
          waiting_count: number
        }[]
      }
      is_business_open_at: {
        Args: { p_at?: string; p_business_id: string }
        Returns: boolean
      }
      is_business_open_now: {
        Args: { p_business_id: string }
        Returns: boolean
      }
      is_valid_iana_timezone: {
        Args: { p_tz: string }
        Returns: boolean
      }
      update_my_business_operating_hours: {
        Args: { p_schedule: Json; p_timezone: string }
        Returns: undefined
      }
      update_my_business_settings: {
        Args: {
          p_branding_theme?: string
          p_contact_email?: string | null
          p_contact_phone?: string | null
          p_name: string
          p_public_description?: string | null
          p_public_instructions?: string | null
        }
        Returns: {
          branding_theme: string
          business_type: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          public_description: string | null
          public_instructions: string | null
          slug: string
          timezone: string
          updated_at: string
        }
      }
      get_my_business_analytics: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      get_ticket: {
        Args: { p_access_token: string; p_public_id: string }
        Returns: {
          business_is_open: boolean
          business_name: string
          called_at: string | null
          cancelled_at: string | null
          completed_at: string | null
          email_notifications_enabled: boolean
          estimated_wait_minutes: number
          joined_at: string
          people_ahead: number
          public_id: string
          queue_id: string
          queue_name: string
          queue_number: number
          queue_status: Database["public"]["Enums"]["queue_status"]
          service_name: string
          serving_at: string | null
          status: Database["public"]["Enums"]["entry_status"]
        }[]
      }
      hash_access_token: { Args: { p_token: string }; Returns: string }
      is_business_member: { Args: { p_business_id: string }; Returns: boolean }
      is_business_owner: { Args: { p_business_id: string }; Returns: boolean }
      join_queue: {
        Args: {
          p_customer_email?: string
          p_customer_name: string
          p_customer_phone?: string
          p_queue_id: string
        }
        Returns: {
          access_token: string
          public_id: string
          queue_number: number
          status: Database["public"]["Enums"]["entry_status"]
        }[]
      }
      claim_customer_notifications_for_entry: {
        Args: { p_entry_id: string }
        Returns: {
          attempts: number
          business_name: string
          channel: Database["public"]["Enums"]["customer_notification_channel"]
          id: string
          public_id: string
          queue_name: string
          queue_number: number
          recipient: string
          type: Database["public"]["Enums"]["customer_notification_type"]
        }[]
      }
      claim_customer_notifications_for_ticket: {
        Args: { p_access_token: string; p_public_id: string }
        Returns: {
          attempts: number
          business_name: string
          channel: Database["public"]["Enums"]["customer_notification_channel"]
          id: string
          public_id: string
          queue_name: string
          queue_number: number
          recipient: string
          type: Database["public"]["Enums"]["customer_notification_type"]
        }[]
      }
      finalize_customer_notification: {
        Args: {
          p_error?: string
          p_notification_id: string
          p_provider_message_id?: string
          p_success: boolean
        }
        Returns: boolean
      }
      finalize_customer_notification_for_ticket: {
        Args: {
          p_access_token: string
          p_error?: string
          p_notification_id: string
          p_provider_message_id?: string
          p_public_id: string
          p_success: boolean
        }
        Returns: boolean
      }
      transition_entry: {
        Args: {
          p_entry_id: string
          p_new_status: Database["public"]["Enums"]["entry_status"]
        }
        Returns: {
          called_at: string
          completed_at: string
          id: string
          public_id: string
          queue_id: string
          queue_number: number
          serving_at: string
          status: Database["public"]["Enums"]["entry_status"]
        }[]
      }
    }
    Enums: {
      customer_notification_channel: "email"
      customer_notification_status:
        | "pending"
        | "sending"
        | "sent"
        | "failed"
      customer_notification_type:
        | "called"
        | "completed"
        | "skipped"
        | "cancelled"
      entry_status:
        | "waiting"
        | "called"
        | "serving"
        | "completed"
        | "skipped"
        | "no_show"
      member_role: "business_owner" | "staff"
      queue_status: "open" | "paused" | "closed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      customer_notification_channel: ["email"],
      customer_notification_status: ["pending", "sending", "sent", "failed"],
      customer_notification_type: [
        "called",
        "completed",
        "skipped",
        "cancelled",
      ],
      entry_status: [
        "waiting",
        "called",
        "serving",
        "completed",
        "skipped",
        "no_show",
      ],
      member_role: ["business_owner", "staff"],
      queue_status: ["open", "paused", "closed"],
    },
  },
} as const

