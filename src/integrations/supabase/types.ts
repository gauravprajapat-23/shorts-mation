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
      ai_generation_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          generated_count: number
          id: string
          model: string
          prompt: string
          provider: string
          requested_count: number
          status: string
          studio_id: string | null
          template_id: string | null
          usage_json: Json
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          generated_count?: number
          id?: string
          model: string
          prompt: string
          provider: string
          requested_count: number
          status?: string
          studio_id?: string | null
          template_id?: string | null
          usage_json?: Json
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          generated_count?: number
          id?: string
          model?: string
          prompt?: string
          provider?: string
          requested_count?: number
          status?: string
          studio_id?: string | null
          template_id?: string | null
          usage_json?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_generation_runs_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "automation_data_studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generation_runs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          api_key_encrypted: string | null
          base_url: string | null
          created_at: string
          last_error: string | null
          model: string
          provider: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          api_key_encrypted?: string | null
          base_url?: string | null
          created_at?: string
          last_error?: string | null
          model: string
          provider: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          api_key_encrypted?: string | null
          base_url?: string | null
          created_at?: string
          last_error?: string | null
          model?: string
          provider?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      analytics_recommendation_runs: {
        Row: {
          basis_snapshot_at: string
          best_hook: string | null
          best_template_id: string | null
          best_upload_hour: number | null
          created_at: string
          id: string
          recommendations_json: Json
          sample_size: number
          summary_json: Json
          user_id: string
        }
        Insert: {
          basis_snapshot_at?: string
          best_hook?: string | null
          best_template_id?: string | null
          best_upload_hour?: number | null
          created_at?: string
          id?: string
          recommendations_json?: Json
          sample_size?: number
          summary_json?: Json
          user_id: string
        }
        Update: {
          basis_snapshot_at?: string
          best_hook?: string | null
          best_template_id?: string | null
          best_upload_hour?: number | null
          created_at?: string
          id?: string
          recommendations_json?: Json
          sample_size?: number
          summary_json?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_recommendation_runs_best_template_id_fkey"
            columns: ["best_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_usages: {
        Row: {
          asset_id: string
          campaign_item_id: string | null
          created_at: string
          id: string
          location: string
          template_id: string | null
          user_id: string
        }
        Insert: {
          asset_id: string
          campaign_item_id?: string | null
          created_at?: string
          id?: string
          location?: string
          template_id?: string | null
          user_id: string
        }
        Update: {
          asset_id?: string
          campaign_item_id?: string | null
          created_at?: string
          id?: string
          location?: string
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_usages_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_usages_campaign_item_id_fkey"
            columns: ["campaign_item_id"]
            isOneToOne: false
            referencedRelation: "campaign_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_usages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          content_hash: string | null
          created_at: string
          file_name: string
          file_url: string
          id: string
          last_used_at: string | null
          lifecycle_status: string
          mime_type: string | null
          size: number | null
          storage_path: string | null
          type: Database["public"]["Enums"]["asset_type"]
          usage_count: number
          user_id: string
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          file_name: string
          file_url: string
          id?: string
          last_used_at?: string | null
          lifecycle_status?: string
          mime_type?: string | null
          size?: number | null
          storage_path?: string | null
          type: Database["public"]["Enums"]["asset_type"]
          usage_count?: number
          user_id: string
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          file_name?: string
          file_url?: string
          id?: string
          last_used_at?: string | null
          lifecycle_status?: string
          mime_type?: string | null
          size?: number | null
          storage_path?: string | null
          type?: Database["public"]["Enums"]["asset_type"]
          usage_count?: number
          user_id?: string
        }
        Relationships: []
      }
      audio_library_items: {
        Row: {
          asset_id: string
          beat_offset_ms: number
          bpm: number | null
          created_at: string
          id: string
          name: string
          role: string
          tags: string[]
          user_id: string
        }
        Insert: {
          asset_id: string
          beat_offset_ms?: number
          bpm?: number | null
          created_at?: string
          id?: string
          name: string
          role: string
          tags?: string[]
          user_id?: string
        }
        Update: {
          asset_id?: string
          beat_offset_ms?: number
          bpm?: number | null
          created_at?: string
          id?: string
          name?: string
          role?: string
          tags?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_library_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_presets: {
        Row: {
          beat_offset_ms: number
          bpm: number | null
          created_at: string
          ducking: boolean
          fade_in_ms: number
          fade_out_ms: number
          id: string
          loop: boolean
          name: string
          role: string
          settings_json: Json
          updated_at: string
          user_id: string
          volume: number
        }
        Insert: {
          beat_offset_ms?: number
          bpm?: number | null
          created_at?: string
          ducking?: boolean
          fade_in_ms?: number
          fade_out_ms?: number
          id?: string
          loop?: boolean
          name: string
          role: string
          settings_json?: Json
          updated_at?: string
          user_id?: string
          volume?: number
        }
        Update: {
          beat_offset_ms?: number
          bpm?: number | null
          created_at?: string
          ducking?: boolean
          fade_in_ms?: number
          fade_out_ms?: number
          id?: string
          loop?: boolean
          name?: string
          role?: string
          settings_json?: Json
          updated_at?: string
          user_id?: string
          volume?: number
        }
        Relationships: []
      }
      automation_data_studios: {
        Row: {
          columns_json: Json
          created_at: string
          id: string
          last_generated_campaign_id: string | null
          mapping_json: Json
          name: string
          rows_json: Json
          settings_json: Json
          template_id: string | null
          timezone: string
          updated_at: string
          user_id: string
          youtube_connection_id: string | null
        }
        Insert: {
          columns_json?: Json
          created_at?: string
          id?: string
          last_generated_campaign_id?: string | null
          mapping_json?: Json
          name?: string
          rows_json?: Json
          settings_json?: Json
          template_id?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
          youtube_connection_id?: string | null
        }
        Update: {
          columns_json?: Json
          created_at?: string
          id?: string
          last_generated_campaign_id?: string | null
          mapping_json?: Json
          name?: string
          rows_json?: Json
          settings_json?: Json
          template_id?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
          youtube_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_data_studios_last_generated_campaign_id_fkey"
            columns: ["last_generated_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_data_studios_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_data_studios_youtube_connection_id_fkey"
            columns: ["youtube_connection_id"]
            isOneToOne: false
            referencedRelation: "youtube_connections"
            referencedColumns: ["id"]
          },
        ]
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
          active_render_attempt_id: string | null
          active_upload_attempt_id: string | null
          asset_json: Json
          audio_json: Json
          campaign_id: string
          content_json: Json
          created_at: string
          error_message: string | null
          id: string
          is_paused: boolean
          paused_at: string | null
          paused_reason: string | null
          render_cancel_requested_at: string | null
          render_dead_lettered_at: string | null
          render_due_at: string | null
          render_estimated_cost_usd: number
          render_job_ref: string | null
          render_next_attempt_at: string | null
          render_priority: number
          render_provider: string | null
          render_retry_count: number
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
          youtube_last_reconciled_at: string | null
          youtube_publish_at: string | null
          youtube_settings_json: Json
          youtube_thumbnail_asset_id: string | null
          youtube_url: string | null
          youtube_video_id: string | null
        }
        Insert: {
          active_render_attempt_id?: string | null
          active_upload_attempt_id?: string | null
          asset_json?: Json
          audio_json?: Json
          campaign_id: string
          content_json?: Json
          created_at?: string
          error_message?: string | null
          id?: string
          is_paused?: boolean
          paused_at?: string | null
          paused_reason?: string | null
          render_cancel_requested_at?: string | null
          render_dead_lettered_at?: string | null
          render_due_at?: string | null
          render_estimated_cost_usd?: number
          render_job_ref?: string | null
          render_next_attempt_at?: string | null
          render_priority?: number
          render_provider?: string | null
          render_retry_count?: number
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
          youtube_last_reconciled_at?: string | null
          youtube_publish_at?: string | null
          youtube_settings_json?: Json
          youtube_thumbnail_asset_id?: string | null
          youtube_url?: string | null
          youtube_video_id?: string | null
        }
        Update: {
          active_render_attempt_id?: string | null
          active_upload_attempt_id?: string | null
          asset_json?: Json
          audio_json?: Json
          campaign_id?: string
          content_json?: Json
          created_at?: string
          error_message?: string | null
          id?: string
          is_paused?: boolean
          paused_at?: string | null
          paused_reason?: string | null
          render_cancel_requested_at?: string | null
          render_dead_lettered_at?: string | null
          render_due_at?: string | null
          render_estimated_cost_usd?: number
          render_job_ref?: string | null
          render_next_attempt_at?: string | null
          render_priority?: number
          render_provider?: string | null
          render_retry_count?: number
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
          youtube_last_reconciled_at?: string | null
          youtube_publish_at?: string | null
          youtube_settings_json?: Json
          youtube_thumbnail_asset_id?: string | null
          youtube_url?: string | null
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_items_active_render_attempt_id_fkey"
            columns: ["active_render_attempt_id"]
            isOneToOne: false
            referencedRelation: "render_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_items_active_upload_attempt_id_fkey"
            columns: ["active_upload_attempt_id"]
            isOneToOne: false
            referencedRelation: "upload_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_items_youtube_thumbnail_asset_id_fkey"
            columns: ["youtube_thumbnail_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
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
      render_attempts: {
        Row: {
          callback_token_hash: string | null
          campaign_id: string
          campaign_item_id: string
          cancelled_at: string | null
          claimed_at: string
          error_message: string | null
          estimated_cost_usd: number
          finalized_at: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          metadata_json: Json
          next_retry_at: string | null
          output_bytes: number | null
          provider: string
          provider_job_ref: string | null
          provider_status: string | null
          progress_percent: number
          progress_updated_at: string | null
          retry_number: number
          status: string
          submitted_at: string | null
          user_id: string
          worker_id: string | null
        }
        Insert: {
          callback_token_hash?: string | null
          campaign_id: string
          campaign_item_id: string
          cancelled_at?: string | null
          claimed_at?: string
          error_message?: string | null
          estimated_cost_usd?: number
          finalized_at?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key: string
          metadata_json?: Json
          next_retry_at?: string | null
          output_bytes?: number | null
          provider?: string
          provider_job_ref?: string | null
          provider_status?: string | null
          progress_percent?: number
          progress_updated_at?: string | null
          retry_number?: number
          status?: string
          submitted_at?: string | null
          user_id: string
          worker_id?: string | null
        }
        Update: {
          callback_token_hash?: string | null
          campaign_id?: string
          campaign_item_id?: string
          cancelled_at?: string | null
          claimed_at?: string
          error_message?: string | null
          estimated_cost_usd?: number
          finalized_at?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          metadata_json?: Json
          next_retry_at?: string | null
          output_bytes?: number | null
          provider?: string
          provider_job_ref?: string | null
          provider_status?: string | null
          progress_percent?: number
          progress_updated_at?: string | null
          retry_number?: number
          status?: string
          submitted_at?: string | null
          user_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "render_attempts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_attempts_campaign_item_id_fkey"
            columns: ["campaign_item_id"]
            isOneToOne: false
            referencedRelation: "campaign_items"
            referencedColumns: ["id"]
          },
        ]
      }
      render_budgets: {
        Row: {
          base_backoff_seconds: number
          max_cost_per_render_usd: number
          max_render_seconds: number
          max_retries: number
          monthly_budget_usd: number
          updated_at: string
          user_id: string
        }
        Insert: {
          base_backoff_seconds?: number
          max_cost_per_render_usd?: number
          max_render_seconds?: number
          max_retries?: number
          monthly_budget_usd?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          base_backoff_seconds?: number
          max_cost_per_render_usd?: number
          max_render_seconds?: number
          max_retries?: number
          monthly_budget_usd?: number
          updated_at?: string
          user_id?: string
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
      render_logs: {
        Row: {
          campaign_id: string
          campaign_item_id: string
          created_at: string
          event: string
          id: number
          level: string
          message: string
          metadata_json: Json
          render_attempt_id: string | null
          user_id: string
        }
        Insert: {
          campaign_id: string
          campaign_item_id: string
          created_at?: string
          event: string
          id?: number
          level: string
          message: string
          metadata_json?: Json
          render_attempt_id?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string
          campaign_item_id?: string
          created_at?: string
          event?: string
          id?: number
          level?: string
          message?: string
          metadata_json?: Json
          render_attempt_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_logs_campaign_item_id_fkey"
            columns: ["campaign_item_id"]
            isOneToOne: false
            referencedRelation: "campaign_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_logs_render_attempt_id_fkey"
            columns: ["render_attempt_id"]
            isOneToOne: false
            referencedRelation: "render_attempts"
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
          worker_url: string | null
          worker_secret_encrypted: string | null
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
          worker_url?: string | null
          worker_secret_encrypted?: string | null
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
          worker_url?: string | null
          worker_secret_encrypted?: string | null
        }
        Relationships: []
      }
      template_favorites: {
        Row: {
          created_at: string
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_favorites_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_versions: {
        Row: {
          aspect_ratio: string
          created_at: string
          id: string
          metadata_json: Json
          name: string
          owner_user_id: string | null
          template_id: string
          template_json: Json
          type: string
          version_number: number
        }
        Insert: {
          aspect_ratio: string
          created_at?: string
          id?: string
          metadata_json?: Json
          name: string
          owner_user_id?: string | null
          template_id: string
          template_json: Json
          type: string
          version_number: number
        }
        Update: {
          aspect_ratio?: string
          created_at?: string
          id?: string
          metadata_json?: Json
          name?: string
          owner_user_id?: string | null
          template_id?: string
          template_json?: Json
          type?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          aspect_ratio: string
          category: string
          created_at: string
          description: string | null
          documentation: string | null
          id: string
          is_default: boolean
          name: string
          preview_video_url: string | null
          published_at: string | null
          remix_of: string | null
          required_variables: string[]
          tags: string[]
          template_json: Json
          thumbnail_url: string | null
          type: string
          updated_at: string
          user_id: string | null
          validation_score: number
          version_number: number
          visibility: string
        }
        Insert: {
          aspect_ratio?: string
          category?: string
          created_at?: string
          description?: string | null
          documentation?: string | null
          id?: string
          is_default?: boolean
          name: string
          preview_video_url?: string | null
          published_at?: string | null
          remix_of?: string | null
          required_variables?: string[]
          tags?: string[]
          template_json?: Json
          thumbnail_url?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
          validation_score?: number
          version_number?: number
          visibility?: string
        }
        Update: {
          aspect_ratio?: string
          category?: string
          created_at?: string
          description?: string | null
          documentation?: string | null
          id?: string
          is_default?: boolean
          name?: string
          preview_video_url?: string | null
          published_at?: string | null
          remix_of?: string | null
          required_variables?: string[]
          tags?: string[]
          template_json?: Json
          thumbnail_url?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
          validation_score?: number
          version_number?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_remix_of_fkey"
            columns: ["remix_of"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tts_generation_runs: {
        Row: {
          asset_id: string | null
          characters: number
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          model: string
          provider: string
          scene_id: string | null
          status: string
          template_id: string | null
          user_id: string
          voice_id: string
        }
        Insert: {
          asset_id?: string | null
          characters?: number
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          model: string
          provider: string
          scene_id?: string | null
          status?: string
          template_id?: string | null
          user_id: string
          voice_id: string
        }
        Update: {
          asset_id?: string | null
          characters?: number
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          model?: string
          provider?: string
          scene_id?: string | null
          status?: string
          template_id?: string | null
          user_id?: string
          voice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tts_generation_runs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tts_generation_runs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tts_providers: {
        Row: {
          api_key_encrypted: string | null
          created_at: string
          default_voice: string | null
          last_error: string | null
          model: string
          provider: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          api_key_encrypted?: string | null
          created_at?: string
          default_voice?: string | null
          last_error?: string | null
          model: string
          provider: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          api_key_encrypted?: string | null
          created_at?: string
          default_voice?: string | null
          last_error?: string | null
          model?: string
          provider?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      upload_attempts: {
        Row: {
          campaign_id: string
          campaign_item_id: string
          claimed_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          intended_final_status: string | null
          intended_publish_at: string | null
          metadata_json: Json
          provider: string
          provider_upload_ref: string | null
          started_at: string | null
          status: string
          user_id: string
          worker_id: string | null
          youtube_video_id: string | null
        }
        Insert: {
          campaign_id: string
          campaign_item_id: string
          claimed_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key: string
          intended_final_status?: string | null
          intended_publish_at?: string | null
          metadata_json?: Json
          provider?: string
          provider_upload_ref?: string | null
          started_at?: string | null
          status?: string
          user_id: string
          worker_id?: string | null
          youtube_video_id?: string | null
        }
        Update: {
          campaign_id?: string
          campaign_item_id?: string
          claimed_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          intended_final_status?: string | null
          intended_publish_at?: string | null
          metadata_json?: Json
          provider?: string
          provider_upload_ref?: string | null
          started_at?: string | null
          status?: string
          user_id?: string
          worker_id?: string | null
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upload_attempts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_attempts_campaign_item_id_fkey"
            columns: ["campaign_item_id"]
            isOneToOne: false
            referencedRelation: "campaign_items"
            referencedColumns: ["id"]
          },
        ]
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
      user_storage_quotas: {
        Row: {
          quota_bytes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          quota_bytes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          quota_bytes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      voice_presets: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          model: string
          name: string
          pronunciation_json: Json
          provider: string
          speed: number
          style_instructions: string | null
          updated_at: string
          user_id: string
          voice_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          model: string
          name: string
          pronunciation_json?: Json
          provider: string
          speed?: number
          style_instructions?: string | null
          updated_at?: string
          user_id?: string
          voice_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          model?: string
          name?: string
          pronunciation_json?: Json
          provider?: string
          speed?: number
          style_instructions?: string | null
          updated_at?: string
          user_id?: string
          voice_id?: string
        }
        Relationships: []
      }
      youtube_channel_snapshots: {
        Row: {
          captured_at: string
          connection_id: string
          id: number
          subscribers: number | null
          user_id: string
          videos: number | null
          views: number | null
        }
        Insert: {
          captured_at?: string
          connection_id: string
          id?: number
          subscribers?: number | null
          user_id: string
          videos?: number | null
          views?: number | null
        }
        Update: {
          captured_at?: string
          connection_id?: string
          id?: number
          subscribers?: number | null
          user_id?: string
          videos?: number | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "youtube_channel_snapshots_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "youtube_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_connections: {
        Row: {
          access_token_encrypted: string | null
          analytics_last_synced_at: string | null
          audience_timezone: string
          channel_avatar: string | null
          channel_id: string
          channel_name: string
          created_at: string
          id: string
          is_connected: boolean
          refresh_token_encrypted: string | null
          token_expiry: string | null
          updated_at: string
          upload_defaults_json: Json
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          analytics_last_synced_at?: string | null
          audience_timezone?: string
          channel_avatar?: string | null
          channel_id: string
          channel_name: string
          created_at?: string
          id?: string
          is_connected?: boolean
          refresh_token_encrypted?: string | null
          token_expiry?: string | null
          updated_at?: string
          upload_defaults_json?: Json
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          analytics_last_synced_at?: string | null
          audience_timezone?: string
          channel_avatar?: string | null
          channel_id?: string
          channel_name?: string
          created_at?: string
          id?: string
          is_connected?: boolean
          refresh_token_encrypted?: string | null
          token_expiry?: string | null
          updated_at?: string
          upload_defaults_json?: Json
          user_id?: string
        }
        Relationships: []
      }
      youtube_publish_presets: {
        Row: {
          category_id: string | null
          created_at: string
          description_template: string
          hashtag_rules_json: Json
          id: string
          is_default: boolean
          language: string | null
          made_for_kids: boolean
          name: string
          playlist_id: string | null
          privacy: string
          title_template: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description_template?: string
          hashtag_rules_json?: Json
          id?: string
          is_default?: boolean
          language?: string | null
          made_for_kids?: boolean
          name: string
          playlist_id?: string | null
          privacy?: string
          title_template?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description_template?: string
          hashtag_rules_json?: Json
          id?: string
          is_default?: boolean
          language?: string | null
          made_for_kids?: boolean
          name?: string
          playlist_id?: string | null
          privacy?: string
          title_template?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      youtube_video_performance: {
        Row: {
          average_view_duration_seconds: number | null
          campaign_id: string | null
          campaign_item_id: string | null
          captured_at: string
          comments: number
          connection_id: string
          cta: string | null
          ctr: number | null
          estimated_minutes_watched: number | null
          first_3s_proxy: number | null
          hook: string | null
          id: number
          impressions: number | null
          likes: number
          metadata_json: Json
          retention_proxy: number | null
          subscribers_gained: number | null
          template_id: string | null
          topic: string | null
          upload_time: string | null
          user_id: string
          variant: string | null
          views: number
          youtube_video_id: string
        }
        Insert: {
          average_view_duration_seconds?: number | null
          campaign_id?: string | null
          campaign_item_id?: string | null
          captured_at?: string
          comments?: number
          connection_id: string
          cta?: string | null
          ctr?: number | null
          estimated_minutes_watched?: number | null
          first_3s_proxy?: number | null
          hook?: string | null
          id?: number
          impressions?: number | null
          likes?: number
          metadata_json?: Json
          retention_proxy?: number | null
          subscribers_gained?: number | null
          template_id?: string | null
          topic?: string | null
          upload_time?: string | null
          user_id: string
          variant?: string | null
          views?: number
          youtube_video_id: string
        }
        Update: {
          average_view_duration_seconds?: number | null
          campaign_id?: string | null
          campaign_item_id?: string | null
          captured_at?: string
          comments?: number
          connection_id?: string
          cta?: string | null
          ctr?: number | null
          estimated_minutes_watched?: number | null
          first_3s_proxy?: number | null
          hook?: string | null
          id?: number
          impressions?: number | null
          likes?: number
          metadata_json?: Json
          retention_proxy?: number | null
          subscribers_gained?: number | null
          template_id?: string | null
          topic?: string | null
          upload_time?: string | null
          user_id?: string
          variant?: string | null
          views?: number
          youtube_video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_video_performance_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "youtube_video_performance_campaign_item_id_fkey"
            columns: ["campaign_item_id"]
            isOneToOne: false
            referencedRelation: "campaign_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "youtube_video_performance_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "youtube_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "youtube_video_performance_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      asset_storage_usage: {
        Args: { p_user_id: string }
        Returns: {
          quota_bytes: number
          used_bytes: number
        }[]
      }
      bulk_update_queue_items: {
        Args: { p_campaign_id: string; p_updates: Json }
        Returns: number
      }
      cancel_render_item: { Args: { p_item_id: string }; Returns: boolean }
      claim_render_item: {
        Args: {
          p_idempotency_key: string
          p_item_id: string
          p_worker_id: string
        }
        Returns: {
          attempt_id: string
          campaign_id: string
          user_id: string
        }[]
      }
      claim_upload_item: {
        Args: {
          p_idempotency_key: string
          p_item_id: string
          p_worker_id: string
        }
        Returns: {
          attempt_id: string
          campaign_id: string
          user_id: string
        }[]
      }
      complete_finished_campaigns: { Args: never; Returns: number }
      create_campaign_with_items: {
        Args: { p_campaign: Json; p_items: Json }
        Returns: {
          campaign_id: string
        }[]
      }
      duplicate_campaign: {
        Args: { p_campaign_id: string; p_name?: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_unused_asset_candidates: {
        Args: { p_older_than_days?: number }
        Returns: {
          id: string
          size: number
          storage_path: string
        }[]
      }
      mark_data_studio_generated: {
        Args: { p_campaign_id: string; p_studio_id: string }
        Returns: boolean
      }
      recover_dead_letter_render: {
        Args: { p_item_id: string }
        Returns: boolean
      }
      refresh_asset_usage_count: {
        Args: { p_asset_id: string }
        Returns: undefined
      }
      remix_template: {
        Args: { p_name?: string; p_template_id: string }
        Returns: string
      }
      replace_asset_everywhere: {
        Args: { p_new_asset: string; p_old_asset: string }
        Returns: {
          campaign_items_updated: number
          templates_updated: number
        }[]
      }
      restore_template_version: {
        Args: { p_template_id: string; p_version_number: number }
        Returns: boolean
      }
      retry_campaign_item: {
        Args: { p_item_id: string }
        Returns: {
          item_id: string
          retry_count: number
          retry_stage: string
        }[]
      }
      retry_selected_campaign_items: {
        Args: { p_campaign_id: string; p_item_ids: string[] }
        Returns: number
      }
      set_campaign_item_paused: {
        Args: { p_item_id: string; p_paused: boolean }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
