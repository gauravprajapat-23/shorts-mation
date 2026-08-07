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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assets: {
        Row: {
          created_at: string
          file_name: string
          file_url: string
          id: string
          mime_type: string | null
          size: number | null
          storage_path: string | null
          type: Database["public"]["Enums"]["asset_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_url: string
          id?: string
          mime_type?: string | null
          size?: number | null
          storage_path?: string | null
          type: Database["public"]["Enums"]["asset_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_url?: string
          id?: string
          mime_type?: string | null
          size?: number | null
          storage_path?: string | null
          type?: Database["public"]["Enums"]["asset_type"]
          user_id?: string
        }
        Relationships: []
      }
      automation_limits: {
        Row: {
          created_at: string
          id: number
          max_global_concurrent_renders: number
          max_global_concurrent_uploads: number
          max_renders_per_tick: number
          max_uploads_per_tick: number
          max_user_concurrent_renders: number
          max_user_concurrent_uploads: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          max_global_concurrent_renders?: number
          max_global_concurrent_uploads?: number
          max_renders_per_tick?: number
          max_uploads_per_tick?: number
          max_user_concurrent_renders?: number
          max_user_concurrent_uploads?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          max_global_concurrent_renders?: number
          max_global_concurrent_uploads?: number
          max_renders_per_tick?: number
          max_uploads_per_tick?: number
          max_user_concurrent_renders?: number
          max_user_concurrent_uploads?: number
          updated_at?: string
        }
        Relationships: []
      }
      automation_logs: {
        Row: {
          campaign_id: string | null
          campaign_item_id: string | null
          created_at: string
          id: string
          level: Database["public"]["Enums"]["log_level"]
          message: string
          metadata_json: Json
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          campaign_item_id?: string | null
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["log_level"]
          message: string
          metadata_json?: Json
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          campaign_item_id?: string | null
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["log_level"]
          message?: string
          metadata_json?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_campaign_item_id_fkey"
            columns: ["campaign_item_id"]
            isOneToOne: false
            referencedRelation: "campaign_items"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_user_limits: {
        Row: {
          created_at: string
          max_concurrent_renders: number | null
          max_concurrent_uploads: number | null
          note: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          max_concurrent_renders?: number | null
          max_concurrent_uploads?: number | null
          note?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          max_concurrent_renders?: number | null
          max_concurrent_uploads?: number | null
          note?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      campaign_items: {
        Row: {
          asset_json: Json
          audio_json: Json
          campaign_id: string
          content_json: Json
          created_at: string
          error_message: string | null
          id: string
          render_due_at: string | null
          render_job_ref: string | null
          render_provider: string | null
          render_submitted_at: string | null
          rendered_video_url: string | null
          retry_count: number
          schedule_at: string | null
          seo_json: Json
          status: Database["public"]["Enums"]["item_status"]
          thumbnail_url: string | null
          updated_at: string
          upload_due_at: string | null
          user_id: string
          video_file_name: string | null
          youtube_publish_at: string | null
          youtube_settings_json: Json
          youtube_url: string | null
          youtube_video_id: string | null
        }
        Insert: {
          asset_json?: Json
          audio_json?: Json
          campaign_id: string
          content_json?: Json
          created_at?: string
          error_message?: string | null
          id?: string
          render_due_at?: string | null
          render_job_ref?: string | null
          render_provider?: string | null
          render_submitted_at?: string | null
          rendered_video_url?: string | null
          retry_count?: number
          schedule_at?: string | null
          seo_json?: Json
          status?: Database["public"]["Enums"]["item_status"]
          thumbnail_url?: string | null
          updated_at?: string
          upload_due_at?: string | null
          user_id: string
          video_file_name?: string | null
          youtube_publish_at?: string | null
          youtube_settings_json?: Json
          youtube_url?: string | null
          youtube_video_id?: string | null
        }
        Update: {
          asset_json?: Json
          audio_json?: Json
          campaign_id?: string
          content_json?: Json
          created_at?: string
          error_message?: string | null
          id?: string
          render_due_at?: string | null
          render_job_ref?: string | null
          render_provider?: string | null
          render_submitted_at?: string | null
          rendered_video_url?: string | null
          retry_count?: number
          schedule_at?: string | null
          seo_json?: Json
          status?: Database["public"]["Enums"]["item_status"]
          thumbnail_url?: string | null
          updated_at?: string
          upload_due_at?: string | null
          user_id?: string
          video_file_name?: string | null
          youtube_publish_at?: string | null
          youtube_settings_json?: Json
          youtube_url?: string | null
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          failed_count: number
          generated_count: number
          id: string
          name: string
          scheduled_count: number
          settings_json: Json
          status: Database["public"]["Enums"]["campaign_status"]
          template_id: string | null
          timezone: string
          total_videos: number
          updated_at: string
          uploaded_count: number
          user_id: string
          youtube_connection_id: string | null
        }
        Insert: {
          created_at?: string
          failed_count?: number
          generated_count?: number
          id?: string
          name: string
          scheduled_count?: number
          settings_json?: Json
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          timezone?: string
          total_videos?: number
          updated_at?: string
          uploaded_count?: number
          user_id: string
          youtube_connection_id?: string | null
        }
        Update: {
          created_at?: string
          failed_count?: number
          generated_count?: number
          id?: string
          name?: string
          scheduled_count?: number
          settings_json?: Json
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          timezone?: string
          total_videos?: number
          updated_at?: string
          uploaded_count?: number
          user_id?: string
          youtube_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_youtube_connection_id_fkey"
            columns: ["youtube_connection_id"]
            isOneToOne: false
            referencedRelation: "youtube_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          onboarding_state: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          onboarding_state?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          onboarding_state?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      render_jobs: {
        Row: {
          campaign_id: string | null
          campaign_item_id: string | null
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          input_vars: Json
          preview_url: string | null
          progress: number
          render_options: Json
          started_at: string
          status: string
          template_id: string | null
          thumbnail_url: string | null
          total_ms: number
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          campaign_item_id?: string | null
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input_vars?: Json
          preview_url?: string | null
          progress?: number
          render_options?: Json
          started_at?: string
          status?: string
          template_id?: string | null
          thumbnail_url?: string | null
          total_ms?: number
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          campaign_item_id?: string | null
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input_vars?: Json
          preview_url?: string | null
          progress?: number
          render_options?: Json
          started_at?: string
          status?: string
          template_id?: string | null
          thumbnail_url?: string | null
          total_ms?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_campaign_item_id_fkey"
            columns: ["campaign_item_id"]
            isOneToOne: false
            referencedRelation: "campaign_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      render_providers: {
        Row: {
          api_key_encrypted: string | null
          created_at: string
          env: string
          id: string
          last_error: string | null
          provider: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          api_key_encrypted?: string | null
          created_at?: string
          env?: string
          id?: string
          last_error?: string | null
          provider?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          api_key_encrypted?: string | null
          created_at?: string
          env?: string
          id?: string
          last_error?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      templates: {
        Row: {
          aspect_ratio: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          template_json: Json
          thumbnail_url: string | null
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          aspect_ratio?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          template_json?: Json
          thumbnail_url?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          aspect_ratio?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          template_json?: Json
          thumbnail_url?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      youtube_connections: {
        Row: {
          access_token_encrypted: string | null
          channel_avatar: string | null
          channel_id: string
          channel_name: string
          created_at: string
          id: string
          is_connected: boolean
          refresh_token_encrypted: string | null
          token_expiry: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          channel_avatar?: string | null
          channel_id: string
          channel_name: string
          created_at?: string
          id?: string
          is_connected?: boolean
          refresh_token_encrypted?: string | null
          token_expiry?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          channel_avatar?: string | null
          channel_id?: string
          channel_name?: string
          created_at?: string
          id?: string
          is_connected?: boolean
          refresh_token_encrypted?: string | null
          token_expiry?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      asset_type: "image" | "video" | "audio" | "logo"
      campaign_status: "draft" | "active" | "paused" | "completed" | "failed"
      item_status:
        | "pending"
        | "rendering"
        | "rendered"
        | "upload_pending"
        | "uploading"
        | "uploaded"
        | "scheduled"
        | "failed"
      log_level: "info" | "warn" | "error"
      privacy_status: "private" | "unlisted" | "public"
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
      app_role: ["admin", "user"],
      asset_type: ["image", "video", "audio", "logo"],
      campaign_status: ["draft", "active", "paused", "completed", "failed"],
      item_status: [
        "pending",
        "rendering",
        "rendered",
        "upload_pending",
        "uploading",
        "uploaded",
        "scheduled",
        "failed",
      ],
      log_level: ["info", "warn", "error"],
      privacy_status: ["private", "unlisted", "public"],
    },
  },
} as const
