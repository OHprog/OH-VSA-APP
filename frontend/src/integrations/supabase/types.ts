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
          cost_estimate: number | null
          created_at: string | null
          date: string | null
          endpoint: string | null
          id: string
          organization_id: string | null
          request_count: number | null
          service: string
          tokens_used: number | null
        }
        Insert: {
          cost_estimate?: number | null
          created_at?: string | null
          date?: string | null
          endpoint?: string | null
          id?: string
          organization_id?: string | null
          request_count?: number | null
          service: string
          tokens_used?: number | null
        }
        Update: {
          cost_estimate?: number | null
          created_at?: string | null
          date?: string | null
          endpoint?: string | null
          id?: string
          organization_id?: string | null
          request_count?: number | null
          service?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: unknown
          organization_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          organization_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          organization_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          api_key_ref: string | null
          base_url: string | null
          created_at: string | null
          id: string
          is_free: boolean | null
          last_error: string | null
          last_sync_at: string | null
          module_type: Database["public"]["Enums"]["module_type"]
          name: string
          notes: string | null
          schedule_cron: string | null
          scrape_config: Json | null
          source_type: string
          status: Database["public"]["Enums"]["data_source_status"] | null
          updated_at: string | null
        }
        Insert: {
          api_key_ref?: string | null
          base_url?: string | null
          created_at?: string | null
          id?: string
          is_free?: boolean | null
          last_error?: string | null
          last_sync_at?: string | null
          module_type: Database["public"]["Enums"]["module_type"]
          name: string
          notes?: string | null
          schedule_cron?: string | null
          scrape_config?: Json | null
          source_type: string
          status?: Database["public"]["Enums"]["data_source_status"] | null
          updated_at?: string | null
        }
        Update: {
          api_key_ref?: string | null
          base_url?: string | null
          created_at?: string | null
          id?: string
          is_free?: boolean | null
          last_error?: string | null
          last_sync_at?: string | null
          module_type?: Database["public"]["Enums"]["module_type"]
          name?: string
          notes?: string | null
          schedule_cron?: string | null
          scrape_config?: Json | null
          source_type?: string
          status?: Database["public"]["Enums"]["data_source_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evaluation_financial_links: {
        Row: {
          evaluation_id: string
          id: string
          linked_at: string
          snapshot_id: string
        }
        Insert: {
          evaluation_id: string
          id?: string
          linked_at?: string
          snapshot_id: string
        }
        Update: {
          evaluation_id?: string
          id?: string
          linked_at?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_financial_links_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: true
            referencedRelation: "evaluation_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_financial_links_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: true
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_financial_links_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "supplier_financial_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_modules: {
        Row: {
          completed_at: string | null
          error_message: string | null
          evaluation_id: string
          findings: Json | null
          id: string
          module_type: Database["public"]["Enums"]["module_type"]
          raw_data: Json | null
          risk_level: Database["public"]["Enums"]["risk_level"] | null
          score: number | null
          sources: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["module_status"] | null
          summary: string | null
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          evaluation_id: string
          findings?: Json | null
          id?: string
          module_type: Database["public"]["Enums"]["module_type"]
          raw_data?: Json | null
          risk_level?: Database["public"]["Enums"]["risk_level"] | null
          score?: number | null
          sources?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["module_status"] | null
          summary?: string | null
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          evaluation_id?: string
          findings?: Json | null
          id?: string
          module_type?: Database["public"]["Enums"]["module_type"]
          raw_data?: Json | null
          risk_level?: Database["public"]["Enums"]["risk_level"] | null
          score?: number | null
          sources?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["module_status"] | null
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
          created_at: string | null
          created_by: string | null
          executive_summary: string | null
          id: string
          notes: string | null
          organization_id: string | null
          overall_risk_level: Database["public"]["Enums"]["risk_level"] | null
          overall_score: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["evaluation_status"] | null
          supplier_id: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          executive_summary?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          overall_risk_level?: Database["public"]["Enums"]["risk_level"] | null
          overall_score?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["evaluation_status"] | null
          supplier_id: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          executive_summary?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          overall_risk_level?: Database["public"]["Enums"]["risk_level"] | null
          overall_score?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["evaluation_status"] | null
          supplier_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
      firecrawl_articles: {
        Row: {
          content_snippet: string | null
          evaluation_id: string | null
          id: string
          language: string | null
          metadata: Json | null
          published_at: string | null
          scrape_run_id: string | null
          scraped_at: string | null
          source_name: string
          source_type: string
          source_url: string
          supplier_ico: string
          supplier_mentions: string[] | null
          tags: string[] | null
          title: string | null
        }
        Insert: {
          content_snippet?: string | null
          evaluation_id?: string | null
          id?: string
          language?: string | null
          metadata?: Json | null
          published_at?: string | null
          scrape_run_id?: string | null
          scraped_at?: string | null
          source_name: string
          source_type: string
          source_url: string
          supplier_ico: string
          supplier_mentions?: string[] | null
          tags?: string[] | null
          title?: string | null
        }
        Update: {
          content_snippet?: string | null
          evaluation_id?: string | null
          id?: string
          language?: string | null
          metadata?: Json | null
          published_at?: string | null
          scrape_run_id?: string | null
          scraped_at?: string | null
          source_name?: string
          source_type?: string
          source_url?: string
          supplier_ico?: string
          supplier_mentions?: string[] | null
          tags?: string[] | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firecrawl_articles_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluation_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firecrawl_articles_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firecrawl_articles_scrape_run_id_fkey"
            columns: ["scrape_run_id"]
            isOneToOne: false
            referencedRelation: "firecrawl_scrape_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      firecrawl_scrape_runs: {
        Row: {
          articles_found: number | null
          articles_stored: number | null
          company_name: string
          completed_at: string | null
          created_at: string | null
          duration_ms: number | null
          errors: string[] | null
          evaluation_id: string | null
          id: string
          source_summaries: Json | null
          sources_scraped: number | null
          status: string
          supplier_ico: string
        }
        Insert: {
          articles_found?: number | null
          articles_stored?: number | null
          company_name: string
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          errors?: string[] | null
          evaluation_id?: string | null
          id?: string
          source_summaries?: Json | null
          sources_scraped?: number | null
          status?: string
          supplier_ico: string
        }
        Update: {
          articles_found?: number | null
          articles_stored?: number | null
          company_name?: string
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          errors?: string[] | null
          evaluation_id?: string | null
          id?: string
          source_summaries?: Json | null
          sources_scraped?: number | null
          status?: string
          supplier_ico?: string
        }
        Relationships: [
          {
            foreignKeyName: "firecrawl_scrape_runs_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluation_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firecrawl_scrape_runs_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          organization_id: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          organization_id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_responses: {
        Row: {
          answers: Json
          evaluation_id: string | null
          id: string
          respondent_department: string | null
          respondent_id: string | null
          respondent_name: string | null
          submitted_at: string | null
          supplier_id: string
          template_id: string
        }
        Insert: {
          answers?: Json
          evaluation_id?: string | null
          id?: string
          respondent_department?: string | null
          respondent_id?: string | null
          respondent_name?: string | null
          submitted_at?: string | null
          supplier_id: string
          template_id: string
        }
        Update: {
          answers?: Json
          evaluation_id?: string | null
          id?: string
          respondent_department?: string | null
          respondent_id?: string | null
          respondent_name?: string | null
          submitted_at?: string | null
          supplier_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_responses_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluation_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_responses_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_responses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_responses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_responses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "questionnaire_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          questions: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          questions?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          questions?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ref_countries: {
        Row: {
          code: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      ref_prompts: {
        Row: {
          id: number
          is_active: boolean
          prompt: string
          sort_order: number
        }
        Insert: {
          id?: number
          is_active?: boolean
          prompt: string
          sort_order?: number
        }
        Update: {
          id?: number
          is_active?: boolean
          prompt?: string
          sort_order?: number
        }
        Relationships: []
      }
      ref_sectors: {
        Row: {
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      reports: {
        Row: {
          evaluation_id: string
          file_name: string | null
          file_size_bytes: number | null
          file_url: string | null
          format: string | null
          generated_at: string | null
          generated_by: string | null
          id: string
          organization_id: string
        }
        Insert: {
          evaluation_id: string
          file_name?: string | null
          file_size_bytes?: number | null
          file_url?: string | null
          format?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          evaluation_id?: string
          file_name?: string | null
          file_size_bytes?: number | null
          file_url?: string | null
          format?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          organization_id?: string
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
          {
            foreignKeyName: "reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_requests: {
        Row: {
          created_at: string
          from_role: Database["public"]["Enums"]["app_role"]
          id: string
          reason: string | null
          requested_role: Database["public"]["Enums"]["app_role"]
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_role: Database["public"]["Enums"]["app_role"]
          id?: string
          reason?: string | null
          requested_role: Database["public"]["Enums"]["app_role"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_role?: Database["public"]["Enums"]["app_role"]
          id?: string
          reason?: string | null
          requested_role?: Database["public"]["Enums"]["app_role"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      scraped_content: {
        Row: {
          content: string | null
          created_at: string | null
          fts: unknown
          id: string
          metadata: Json | null
          scraped_at: string | null
          source_name: string
          title: string | null
          url: string
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          fts?: unknown
          id?: string
          metadata?: Json | null
          scraped_at?: string | null
          source_name: string
          title?: string | null
          url: string
        }
        Update: {
          content?: string | null
          created_at?: string | null
          fts?: unknown
          id?: string
          metadata?: Json | null
          scraped_at?: string | null
          source_name?: string
          title?: string | null
          url?: string
        }
        Relationships: []
      }
      supplier_financial_snapshots: {
        Row: {
          company_name: string
          created_at: string
          current_assets: number | null
          current_liabilities: number | null
          current_ratio: number | null
          data_complete: boolean
          debt_to_equity: number | null
          document_type: string | null
          equity: number | null
          equity_ratio: number | null
          fiscal_year: number
          id: string
          net_profit: number | null
          operating_profit: number | null
          profit_margin: number | null
          raw_extraction: Json | null
          revenue: number | null
          roa: number | null
          scraped_at: string
          source_url: string | null
          supplier_ico: string
          total_assets: number | null
          total_liabilities: number | null
          updated_at: string
        }
        Insert: {
          company_name: string
          created_at?: string
          current_assets?: number | null
          current_liabilities?: number | null
          current_ratio?: number | null
          data_complete?: boolean
          debt_to_equity?: number | null
          document_type?: string | null
          equity?: number | null
          equity_ratio?: number | null
          fiscal_year: number
          id?: string
          net_profit?: number | null
          operating_profit?: number | null
          profit_margin?: number | null
          raw_extraction?: Json | null
          revenue?: number | null
          roa?: number | null
          scraped_at?: string
          source_url?: string | null
          supplier_ico: string
          total_assets?: number | null
          total_liabilities?: number | null
          updated_at?: string
        }
        Update: {
          company_name?: string
          created_at?: string
          current_assets?: number | null
          current_liabilities?: number | null
          current_ratio?: number | null
          data_complete?: boolean
          debt_to_equity?: number | null
          document_type?: string | null
          equity?: number | null
          equity_ratio?: number | null
          fiscal_year?: number
          id?: string
          net_profit?: number | null
          operating_profit?: number | null
          profit_margin?: number | null
          raw_extraction?: Json | null
          revenue?: number | null
          roa?: number | null
          scraped_at?: string
          source_url?: string | null
          supplier_ico?: string
          total_assets?: number | null
          total_liabilities?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          city: string | null
          company_name: string
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          dic: string | null
          ico: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          organization_id: string
          parent_id: string | null
          postal_code: string | null
          sector: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_name: string
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          dic?: string | null
          ico?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          organization_id?: string
          parent_id?: string | null
          postal_code?: string | null
          sector?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_name?: string
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          dic?: string | null
          ico?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          organization_id?: string
          parent_id?: string | null
          postal_code?: string | null
          sector?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "supplier_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
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
          ico: string | null
          id: string | null
          module_count: number | null
          modules_completed: number | null
          overall_risk_level: Database["public"]["Enums"]["risk_level"] | null
          overall_score: number | null
          status: Database["public"]["Enums"]["evaluation_status"] | null
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
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          dic: string | null
          evaluation_count: number | null
          ico: string | null
          id: string | null
          is_active: boolean | null
          last_evaluated_at: string | null
          latest_risk_level: Database["public"]["Enums"]["risk_level"] | null
          latest_score: number | null
          notes: string | null
          organization_id: string | null
          parent_company_name: string | null
          parent_id: string | null
          postal_code: string | null
          sector: string | null
          subsidiary_count: number | null
          updated_at: string | null
          website_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "supplier_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_evaluation: {
        Args: {
          p_module_types: Database["public"]["Enums"]["module_type"][]
          p_supplier_id: string
        }
        Returns: string
      }
      create_report: { Args: { p_evaluation_id: string }; Returns: string }
      get_daily_evaluation_stats: {
        Args: { p_days?: number }
        Returns: {
          avg_score: number
          period: string
          total_evaluations: number
        }[]
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
      get_user_org_id: { Args: never; Returns: string }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_audit: {
        Args: {
          p_action: string
          p_details?: Json
          p_entity_id: string
          p_entity_type: string
        }
        Returns: undefined
      }
      search_scraped_content: {
        Args: { p_limit?: number; p_query: string; p_source_name?: string }
        Returns: {
          content_preview: string
          id: string
          metadata: Json
          rank: number
          scraped_at: string
          source_name: string
          title: string
          url: string
        }[]
      }
      search_suppliers: {
        Args: { p_limit?: number; search_term?: string }
        Returns: {
          address: string | null
          city: string | null
          company_name: string | null
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          dic: string | null
          evaluation_count: number | null
          ico: string | null
          id: string | null
          is_active: boolean | null
          last_evaluated_at: string | null
          latest_risk_level: Database["public"]["Enums"]["risk_level"] | null
          latest_score: number | null
          notes: string | null
          organization_id: string | null
          parent_company_name: string | null
          parent_id: string | null
          postal_code: string | null
          sector: string | null
          subsidiary_count: number | null
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
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "analyst" | "viewer" | "visitor"
      data_source_status: "active" | "inactive" | "error"
      evaluation_status:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
      module_status: "queued" | "running" | "completed" | "failed" | "skipped"
      module_type:
        | "financial"
        | "compliance"
        | "sanctions"
        | "market"
        | "esg"
        | "cyber"
        | "internal"
      risk_level: "low" | "medium" | "high" | "critical"
      user_role: "admin" | "analyst" | "viewer" | "plebian"
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
      app_role: ["admin", "analyst", "viewer", "visitor"],
      data_source_status: ["active", "inactive", "error"],
      evaluation_status: [
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
      ],
      module_status: ["queued", "running", "completed", "failed", "skipped"],
      module_type: [
        "financial",
        "compliance",
        "sanctions",
        "market",
        "esg",
        "cyber",
        "internal",
      ],
      risk_level: ["low", "medium", "high", "critical"],
      user_role: ["admin", "analyst", "viewer", "plebian"],
    },
  },
} as const
