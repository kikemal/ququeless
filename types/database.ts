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
      businesses: {
        Row: {
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
        Insert: {
          business_type: string
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          business_type?: string
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
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
          completed_at: string | null
          customer_name: string
          customer_phone: string | null
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
          completed_at?: string | null
          customer_name: string
          customer_phone?: string | null
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
          completed_at?: string | null
          customer_name?: string
          customer_phone?: string | null
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
      generate_access_token: { Args: never; Returns: string }
      get_ticket: {
        Args: { p_access_token: string; p_public_id: string }
        Returns: {
          business_name: string
          estimated_wait_minutes: number
          people_ahead: number
          public_id: string
          queue_name: string
          queue_number: number
          service_name: string
          status: Database["public"]["Enums"]["entry_status"]
        }[]
      }
      hash_access_token: { Args: { p_token: string }; Returns: string }
      is_business_member: { Args: { p_business_id: string }; Returns: boolean }
      is_business_owner: { Args: { p_business_id: string }; Returns: boolean }
      join_queue: {
        Args: {
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

