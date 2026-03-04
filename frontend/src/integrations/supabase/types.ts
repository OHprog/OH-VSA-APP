export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_usage: {
        Row: {
          cost_estimate: number
          created_at: string
          date: string
          endpoint: string | null
          id: string
          organization_id: string | null
          request_count: number
          service: string
          tokens_used: number
        }
        Insert: {
          cost_estimate?: number
          created_at?: string
          date?: string
          endpoint?: string | null
          id?: string
          organization_id?: string | null
          request_count?: number
          service: string
          tokens_used?: number
        }
        Update: {
          cost_estimate?: number
          created_at?: string
          date?: string
          endpoint?: string | null
          id?: string
          organization_id?: string | null
          request_count?: number
          service?: string
          tokens_used?: number
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          organization_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organization_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organization_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      data_sources: {
        Row: {
          base_url: string | null
          created_at: string
          id: string
          is_free: boolean
          last_error: string | null
          last_sync_at: string | null
          module_type: string
          name: string
          notes: string | null
          schedule_cron: string | null
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          id?: string
          is_free?: boolean
          last_error?: string | null
          last_sync_at?: string | null
          module_type: string
          name: string
          notes?: string | null
          schedule_cron?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          created_at?: string
          id?: string
          is_free?: boolean
          last_error?: string | null
          last_sync_at?: string | null
          module_type?: string
          name?: string
          notes?: string | null
          schedule_cron?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      evaluation_modules: {
        Row: {
          completed_at: string | null
          evaluation_id: string
          findings: Json | null
          id: string
          module_type: string
          raw_data: Json | null
          risk_level: string | null
          score: number | null
          sources: Json | null
          started_at: string | null
          status: string
          summary: string | null
        }
        Insert: {
          completed_at?: string | null
          evaluation_id: string
          findings?: Json | null
          id?: string
          module_type: string
          raw_data?: Json | null
          risk_level?: string | null
          score?: number | null
          sources?: Json | null
          started_at?: string | null
          status?: string
          summary?: string | null
        }
        Update: {
          completed_at?: string | null
          evaluation_id?: string
          findings?: Json | null
          id?: string
          module_type?: string
          raw_data?: Json | null
          risk_level?: string | null
          score?: number | null
          sources?: Json | null
          started_at?: string | null
          status?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_modules_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluation_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_modules_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          executive_summary: string | null
          id: string
          overall_risk_level: string | null
          overall_score: number | null
          status: string
          supplier_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          executive_summary?: string | null
          id?: string
          overall_risk_level?: string | null
          overall_score?: number | null
          status?: string
          supplier_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          executive_summary?: string | null
          id?: string
          overall_risk_level?: string | null
          overall_score?: number | null
          status?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          organization_id: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          organization_id?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          evaluation_id: string
          file_url: string | null
          generated_at: string
          id: string
        }
        Insert: {
          evaluation_id: string
          file_url?: string | null
          generated_at?: string
          id?: string
        }
        Update: {
          evaluation_id?: string
          file_url?: string | null
          generated_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluation_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          city: string | null
          company_name: string
          country: string | null
          created_at: string
          created_by: string | null
          ico: string | null
          id: string
          notes: string | null
          sector: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_name: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          ico?: string | null
          id?: string
          notes?: string | null
          sector?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          ico?: string | null
          id?: string
          notes?: string | null
          sector?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      dashboard_stats: {
        Row: {
          active_evaluations: number | null
          avg_score: number | null
          completed_evaluations: number | null
          critical_risk_count: number | null
          high_risk_count: number | null
          low_risk_count: number | null
          medium_risk_count: number | null
          total_suppliers: number | null
        }
        Relationships: []
      }
      evaluation_list: {
        Row: {
          company_name: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          executive_summary: string | null
          ico: string | null
          id: string | null
          module_count: number | null
          modules_completed: number | null
          overall_risk_level: string | null
          overall_score: number | null
          status: string | null
          supplier_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_summary: {
        Row: {
          address: string | null
          city: string | null
          company_name: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          evaluation_count: number | null
          ico: string | null
          id: string | null
          last_evaluated: string | null
          notes: string | null
          sector: string | null
          updated_at: string | null
          website_url: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_evaluation: {
        Args: { p_module_types: string[]; p_supplier_id: string }
        Returns: string
      }
      get_evaluation_detail: {
        Args: { p_evaluation_id: string }
        Returns: Json
      }
      get_monthly_evaluation_stats: {
        Args: { p_months?: number }
        Returns: {
          avg_score: number
          month: string
          total_evaluations: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      search_suppliers: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          address: string | null
          city: string | null
          company_name: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          evaluation_count: number | null
          ico: string | null
          id: string | null
          last_evaluated: string | null
          notes: string | null
          sector: string | null
          updated_at: string | null
          website_url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "supplier_summary"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      app_role: "admin" | "analyst" | "viewer"
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
  public: {
    Enums: {
      app_role: ["admin", "analyst", "viewer"],
    },
  },
} as const
