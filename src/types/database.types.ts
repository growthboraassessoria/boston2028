// Gerado por scripts/db/gen-types.mjs a partir das migrations aplicadas no Postgres local. Não editar à mão.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  rtb: {
    Tables: {
      analytics_events: {
        Row: {
          id: number
          anon_id: string
          user_id: string | null
          name: string
          path: string | null
          props: Json
          created_at: string
        };
        Insert: {
          id?: number
          anon_id: string
          user_id?: string | null
          name: string
          path?: string | null
          props?: Json
          created_at?: string
        };
        Update: {
          id?: number
          anon_id?: string
          user_id?: string | null
          name?: string
          path?: string | null
          props?: Json
          created_at?: string
        };
      };
      application_answers: {
        Row: {
          id: string
          application_id: string
          question_key: string
          answer: Json
          created_at: string
        };
        Insert: {
          id?: string
          application_id: string
          question_key: string
          answer: Json
          created_at?: string
        };
        Update: {
          id?: string
          application_id?: string
          question_key?: string
          answer?: Json
          created_at?: string
        };
      };
      application_documents: {
        Row: {
          id: string
          user_id: string
          application_id: string | null
          kind: string
          bucket: string
          storage_path: string
          mime: string
          size_bytes: number
          original_name: string | null
          created_at: string
          deleted_at: string | null
        };
        Insert: {
          id?: string
          user_id: string
          application_id?: string | null
          kind: string
          bucket?: string
          storage_path: string
          mime: string
          size_bytes: number
          original_name?: string | null
          created_at?: string
          deleted_at?: string | null
        };
        Update: {
          id?: string
          user_id?: string
          application_id?: string | null
          kind?: string
          bucket?: string
          storage_path?: string
          mime?: string
          size_bytes?: number
          original_name?: string | null
          created_at?: string
          deleted_at?: string | null
        };
      };
      application_events: {
        Row: {
          id: number
          application_id: string | null
          user_id: string
          type: string
          from_status: string | null
          to_status: string | null
          actor_id: string | null
          visibility: string
          payload: Json
          created_at: string
        };
        Insert: {
          id?: number
          application_id?: string | null
          user_id: string
          type: string
          from_status?: string | null
          to_status?: string | null
          actor_id?: string | null
          visibility?: string
          payload?: Json
          created_at?: string
        };
        Update: {
          id?: number
          application_id?: string | null
          user_id?: string
          type?: string
          from_status?: string | null
          to_status?: string | null
          actor_id?: string | null
          visibility?: string
          payload?: Json
          created_at?: string
        };
      };
      application_health: {
        Row: {
          application_id: string
          user_id: string
          injury_in_treatment: boolean
          consent_id: string | null
          retain_until: string
          created_at: string
          updated_at: string
        };
        Insert: {
          application_id: string
          user_id: string
          injury_in_treatment: boolean
          consent_id?: string | null
          retain_until: string
          created_at?: string
          updated_at?: string
        };
        Update: {
          application_id?: string
          user_id?: string
          injury_in_treatment?: boolean
          consent_id?: string | null
          retain_until?: string
          created_at?: string
          updated_at?: string
        };
      };
      applications: {
        Row: {
          id: string
          user_id: string
          cycle_id: string
          status: string
          prelim_result: string | null
          prelim_reasons: string[]
          standard_version_id: string | null
          category: string | null
          age_on_race_day: number | null
          age_group: string | null
          standard_seconds: number | null
          projected_marathon_seconds: number | null
          gap_seconds: number | null
          target_race_choice: string | null
          target_race_id: string | null
          sessions_4plus: boolean | null
          mark_id: string | null
          availability_note: string | null
          late_entry: boolean
          submitted_at: string | null
          sla_due_at: string | null
          first_contact_at: string | null
          reviewer_id: string | null
          athlete_message: string | null
          next_reassessment_on: string | null
          withdrawn_at: string | null
          idempotency_key: string | null
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          user_id: string
          cycle_id: string
          status?: string
          prelim_result?: string | null
          prelim_reasons?: string[]
          standard_version_id?: string | null
          category?: string | null
          age_on_race_day?: number | null
          age_group?: string | null
          standard_seconds?: number | null
          projected_marathon_seconds?: number | null
          gap_seconds?: number | null
          target_race_choice?: string | null
          target_race_id?: string | null
          sessions_4plus?: boolean | null
          mark_id?: string | null
          availability_note?: string | null
          late_entry?: boolean
          submitted_at?: string | null
          sla_due_at?: string | null
          first_contact_at?: string | null
          reviewer_id?: string | null
          athlete_message?: string | null
          next_reassessment_on?: string | null
          withdrawn_at?: string | null
          idempotency_key?: string | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          cycle_id?: string
          status?: string
          prelim_result?: string | null
          prelim_reasons?: string[]
          standard_version_id?: string | null
          category?: string | null
          age_on_race_day?: number | null
          age_group?: string | null
          standard_seconds?: number | null
          projected_marathon_seconds?: number | null
          gap_seconds?: number | null
          target_race_choice?: string | null
          target_race_id?: string | null
          sessions_4plus?: boolean | null
          mark_id?: string | null
          availability_note?: string | null
          late_entry?: boolean
          submitted_at?: string | null
          sla_due_at?: string | null
          first_contact_at?: string | null
          reviewer_id?: string | null
          athlete_message?: string | null
          next_reassessment_on?: string | null
          withdrawn_at?: string | null
          idempotency_key?: string | null
          created_at?: string
          updated_at?: string
        };
      };
      athlete_coach_assignments: {
        Row: {
          id: string
          athlete_id: string
          coach_user_id: string
          assigned_by: string | null
          starts_at: string
          ends_at: string | null
        };
        Insert: {
          id?: string
          athlete_id: string
          coach_user_id: string
          assigned_by?: string | null
          starts_at?: string
          ends_at?: string | null
        };
        Update: {
          id?: string
          athlete_id?: string
          coach_user_id?: string
          assigned_by?: string | null
          starts_at?: string
          ends_at?: string | null
        };
      };
      athlete_states: {
        Row: {
          user_id: string
          membership_declared: string
          membership_verified: string
          access_status: string
          journey_status: string
          polo: string | null
          automations_paused: boolean
          updated_at: string
        };
        Insert: {
          user_id: string
          membership_declared?: string
          membership_verified?: string
          access_status?: string
          journey_status?: string
          polo?: string | null
          automations_paused?: boolean
          updated_at?: string
        };
        Update: {
          user_id?: string
          membership_declared?: string
          membership_verified?: string
          access_status?: string
          journey_status?: string
          polo?: string | null
          automations_paused?: boolean
          updated_at?: string
        };
      };
      audit_logs: {
        Row: {
          id: number
          actor_id: string | null
          action: string
          entity: string
          entity_id: string | null
          data: Json
          created_at: string
        };
        Insert: {
          id?: number
          actor_id?: string | null
          action: string
          entity: string
          entity_id?: string | null
          data?: Json
          created_at?: string
        };
        Update: {
          id?: number
          actor_id?: string | null
          action?: string
          entity?: string
          entity_id?: string | null
          data?: Json
          created_at?: string
        };
      };
      badge_definitions: {
        Row: {
          id: string
          slug: string
          name: string
          description: string
          kind: string
          icon: string
          active: boolean
          created_at: string
        };
        Insert: {
          id?: string
          slug: string
          name: string
          description: string
          kind?: string
          icon?: string
          active?: boolean
          created_at?: string
        };
        Update: {
          id?: string
          slug?: string
          name?: string
          description?: string
          kind?: string
          icon?: string
          active?: boolean
          created_at?: string
        };
      };
      benefit_codes: {
        Row: {
          id: string
          benefit_id: string
          code: string
          status: string
          redemption_id: string | null
          created_at: string
        };
        Insert: {
          id?: string
          benefit_id: string
          code: string
          status?: string
          redemption_id?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          benefit_id?: string
          code?: string
          status?: string
          redemption_id?: string | null
          created_at?: string
        };
      };
      benefit_redemptions: {
        Row: {
          id: string
          benefit_id: string
          partner_id: string
          user_id: string
          sequence: number
          status: string
          reserved_at: string
          issued_at: string | null
          expires_at: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          validation_idempotency_key: string | null
          cancelled_at: string | null
          cancel_reason: string | null
          stock_returned: boolean
          idempotency_key: string
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          benefit_id: string
          partner_id: string
          user_id: string
          sequence: number
          status: string
          reserved_at?: string
          issued_at?: string | null
          expires_at?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          validation_idempotency_key?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
          stock_returned?: boolean
          idempotency_key: string
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          benefit_id?: string
          partner_id?: string
          user_id?: string
          sequence?: number
          status?: string
          reserved_at?: string
          issued_at?: string | null
          expires_at?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          validation_idempotency_key?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
          stock_returned?: boolean
          idempotency_key?: string
          created_at?: string
          updated_at?: string
        };
      };
      benefit_secrets: {
        Row: {
          benefit_id: string
          coupon_code: string | null
          external_url: string | null
          updated_at: string
        };
        Insert: {
          benefit_id: string
          coupon_code?: string | null
          external_url?: string | null
          updated_at?: string
        };
        Update: {
          benefit_id?: string
          coupon_code?: string | null
          external_url?: string | null
          updated_at?: string
        };
      };
      benefits: {
        Row: {
          id: string
          partner_id: string
          slug: string
          title: string
          summary: string
          description: string | null
          rules: string | null
          category: string
          audience_note: string | null
          journey_scope: string
          requires_active_member: boolean
          cities: string[]
          ufs: string[]
          polos: string[]
          starts_at: string | null
          ends_at: string | null
          total_quantity: number | null
          remaining_quantity: number | null
          per_member_limit: number
          restock_on_expiry: boolean
          image_path: string | null
          redemption_instructions: string | null
          mode: string
          generate_codes: boolean
          code_ttl_hours: number
          terms: string | null
          cancellation_policy: string | null
          visibility: string
          status: string
          is_health_related: boolean
          is_demo: boolean
          views_count: number
          created_by: string | null
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          partner_id: string
          slug: string
          title: string
          summary: string
          description?: string | null
          rules?: string | null
          category: string
          audience_note?: string | null
          journey_scope?: string
          requires_active_member?: boolean
          cities?: string[]
          ufs?: string[]
          polos?: string[]
          starts_at?: string | null
          ends_at?: string | null
          total_quantity?: number | null
          remaining_quantity?: number | null
          per_member_limit?: number
          restock_on_expiry?: boolean
          image_path?: string | null
          redemption_instructions?: string | null
          mode: string
          generate_codes?: boolean
          code_ttl_hours?: number
          terms?: string | null
          cancellation_policy?: string | null
          visibility?: string
          status?: string
          is_health_related?: boolean
          is_demo?: boolean
          views_count?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          partner_id?: string
          slug?: string
          title?: string
          summary?: string
          description?: string | null
          rules?: string | null
          category?: string
          audience_note?: string | null
          journey_scope?: string
          requires_active_member?: boolean
          cities?: string[]
          ufs?: string[]
          polos?: string[]
          starts_at?: string | null
          ends_at?: string | null
          total_quantity?: number | null
          remaining_quantity?: number | null
          per_member_limit?: number
          restock_on_expiry?: boolean
          image_path?: string | null
          redemption_instructions?: string | null
          mode?: string
          generate_codes?: boolean
          code_ttl_hours?: number
          terms?: string | null
          cancellation_policy?: string | null
          visibility?: string
          status?: string
          is_health_related?: boolean
          is_demo?: boolean
          views_count?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        };
      };
      business_holidays: {
        Row: {
          day: string
          label: string
          kind: string
          created_at: string
        };
        Insert: {
          day: string
          label: string
          kind?: string
          created_at?: string
        };
        Update: {
          day?: string
          label?: string
          kind?: string
          created_at?: string
        };
      };
      campaigns: {
        Row: {
          id: string
          slug: string
          name: string
          utm_campaign: string | null
          starts_at: string | null
          ends_at: string | null
          active: boolean
          created_at: string
        };
        Insert: {
          id?: string
          slug: string
          name: string
          utm_campaign?: string | null
          starts_at?: string | null
          ends_at?: string | null
          active?: boolean
          created_at?: string
        };
        Update: {
          id?: string
          slug?: string
          name?: string
          utm_campaign?: string | null
          starts_at?: string | null
          ends_at?: string | null
          active?: boolean
          created_at?: string
        };
      };
      commercial_activities: {
        Row: {
          id: string
          opportunity_id: string
          actor_id: string | null
          kind: string
          note: string | null
          created_at: string
        };
        Insert: {
          id?: string
          opportunity_id: string
          actor_id?: string | null
          kind: string
          note?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          opportunity_id?: string
          actor_id?: string | null
          kind?: string
          note?: string | null
          created_at?: string
        };
      };
      commercial_opportunities: {
        Row: {
          id: string
          user_id: string
          application_id: string | null
          origin: string
          status: string
          owner_id: string | null
          next_action: string | null
          next_action_on: string | null
          lost_reason: string | null
          converted_at: string | null
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          user_id: string
          application_id?: string | null
          origin: string
          status?: string
          owner_id?: string | null
          next_action?: string | null
          next_action_on?: string | null
          lost_reason?: string | null
          converted_at?: string | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          application_id?: string | null
          origin?: string
          status?: string
          owner_id?: string | null
          next_action?: string | null
          next_action_on?: string | null
          lost_reason?: string | null
          converted_at?: string | null
          created_at?: string
          updated_at?: string
        };
      };
      consents: {
        Row: {
          id: string
          user_id: string
          purpose: string
          granted: boolean
          policy_version: string
          source: string
          created_at: string
        };
        Insert: {
          id?: string
          user_id: string
          purpose: string
          granted: boolean
          policy_version: string
          source?: string
          created_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          purpose?: string
          granted?: boolean
          policy_version?: string
          source?: string
          created_at?: string
        };
      };
      contact_attempts: {
        Row: {
          id: string
          application_id: string
          user_id: string
          actor_id: string
          channel: string
          outcome: string
          note: string | null
          created_at: string
        };
        Insert: {
          id?: string
          application_id: string
          user_id: string
          actor_id: string
          channel: string
          outcome: string
          note?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          application_id?: string
          user_id?: string
          actor_id?: string
          channel?: string
          outcome?: string
          note?: string | null
          created_at?: string
        };
      };
      data_requests: {
        Row: {
          id: string
          user_id: string
          kind: string
          details: string | null
          status: string
          response: string | null
          handled_by: string | null
          handled_at: string | null
          created_at: string
        };
        Insert: {
          id?: string
          user_id: string
          kind: string
          details?: string | null
          status?: string
          response?: string | null
          handled_by?: string | null
          handled_at?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          kind?: string
          details?: string | null
          status?: string
          response?: string | null
          handled_by?: string | null
          handled_at?: string | null
          created_at?: string
        };
      };
      earned_badges: {
        Row: {
          id: string
          user_id: string
          badge_id: string
          source_ref: string
          note: string | null
          awarded_by: string | null
          awarded_at: string
        };
        Insert: {
          id?: string
          user_id: string
          badge_id: string
          source_ref?: string
          note?: string | null
          awarded_by?: string | null
          awarded_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          badge_id?: string
          source_ref?: string
          note?: string | null
          awarded_by?: string | null
          awarded_at?: string
        };
      };
      email_delivery_events: {
        Row: {
          id: string
          outbox_id: string | null
          provider: string
          provider_event_id: string | null
          event_type: string
          payload: Json
          created_at: string
        };
        Insert: {
          id?: string
          outbox_id?: string | null
          provider: string
          provider_event_id?: string | null
          event_type: string
          payload?: Json
          created_at?: string
        };
        Update: {
          id?: string
          outbox_id?: string | null
          provider?: string
          provider_event_id?: string | null
          event_type?: string
          payload?: Json
          created_at?: string
        };
      };
      email_outbox: {
        Row: {
          id: string
          user_id: string | null
          to_email: string
          template_key: string
          variables: Json
          status: string
          attempts: number
          next_attempt_at: string
          locked_at: string | null
          provider: string | null
          provider_message_id: string | null
          last_error: string | null
          idempotency_key: string
          created_at: string
          accepted_at: string | null
          delivered_at: string | null
        };
        Insert: {
          id?: string
          user_id?: string | null
          to_email: string
          template_key: string
          variables?: Json
          status?: string
          attempts?: number
          next_attempt_at?: string
          locked_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          last_error?: string | null
          idempotency_key: string
          created_at?: string
          accepted_at?: string | null
          delivered_at?: string | null
        };
        Update: {
          id?: string
          user_id?: string | null
          to_email?: string
          template_key?: string
          variables?: Json
          status?: string
          attempts?: number
          next_attempt_at?: string
          locked_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          last_error?: string | null
          idempotency_key?: string
          created_at?: string
          accepted_at?: string | null
          delivered_at?: string | null
        };
      };
      external_member_links: {
        Row: {
          id: string
          user_id: string
          provider: string
          external_member_id: string
          status: string
          confidence: number | null
          matched_on: string[] | null
          last_synced_at: string | null
          last_error: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          user_id: string
          provider: string
          external_member_id: string
          status?: string
          confidence?: number | null
          matched_on?: string[] | null
          last_synced_at?: string | null
          last_error?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          provider?: string
          external_member_id?: string
          status?: string
          confidence?: number | null
          matched_on?: string[] | null
          last_synced_at?: string | null
          last_error?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        };
      };
      feature_flags: {
        Row: {
          key: string
          enabled: boolean
          description: string
          updated_by: string | null
          updated_at: string
        };
        Insert: {
          key: string
          enabled?: boolean
          description: string
          updated_by?: string | null
          updated_at?: string
        };
        Update: {
          key?: string
          enabled?: boolean
          description?: string
          updated_by?: string | null
          updated_at?: string
        };
      };
      index_simulations: {
        Row: {
          id: string
          user_id: string | null
          anon_key: string | null
          idempotency_key: string | null
          standard_version_id: string | null
          birth_date: string
          category: string
          distance: string
          mark_seconds: number
          mark_date: string
          race_name: string | null
          age_on_race_day: number | null
          age_group: string | null
          standard_seconds: number | null
          projected_marathon_seconds: number | null
          gap_seconds: number | null
          internal_fit: string
          ip_hash: string | null
          created_at: string
        };
        Insert: {
          id?: string
          user_id?: string | null
          anon_key?: string | null
          idempotency_key?: string | null
          standard_version_id?: string | null
          birth_date: string
          category: string
          distance: string
          mark_seconds: number
          mark_date: string
          race_name?: string | null
          age_on_race_day?: number | null
          age_group?: string | null
          standard_seconds?: number | null
          projected_marathon_seconds?: number | null
          gap_seconds?: number | null
          internal_fit: string
          ip_hash?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          user_id?: string | null
          anon_key?: string | null
          idempotency_key?: string | null
          standard_version_id?: string | null
          birth_date?: string
          category?: string
          distance?: string
          mark_seconds?: number
          mark_date?: string
          race_name?: string | null
          age_on_race_day?: number | null
          age_group?: string | null
          standard_seconds?: number | null
          projected_marathon_seconds?: number | null
          gap_seconds?: number | null
          internal_fit?: string
          ip_hash?: string | null
          created_at?: string
        };
      };
      info_requests: {
        Row: {
          id: string
          application_id: string
          user_id: string
          decision_id: string | null
          requested_by: string
          message: string
          status: string
          response: string | null
          document_id: string | null
          requested_at: string
          responded_at: string | null
        };
        Insert: {
          id?: string
          application_id: string
          user_id: string
          decision_id?: string | null
          requested_by: string
          message: string
          status?: string
          response?: string | null
          document_id?: string | null
          requested_at?: string
          responded_at?: string | null
        };
        Update: {
          id?: string
          application_id?: string
          user_id?: string
          decision_id?: string | null
          requested_by?: string
          message?: string
          status?: string
          response?: string | null
          document_id?: string | null
          requested_at?: string
          responded_at?: string | null
        };
      };
      journey_enrollments: {
        Row: {
          id: string
          user_id: string
          application_id: string
          cycle_id: string
          journey: string
          status: string
          decision_id: string
          offered_at: string
          accepted_at: string | null
          activated_at: string | null
          ended_at: string | null
          end_reason: string | null
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          user_id: string
          application_id: string
          cycle_id: string
          journey: string
          status: string
          decision_id: string
          offered_at?: string
          accepted_at?: string | null
          activated_at?: string | null
          ended_at?: string | null
          end_reason?: string | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          application_id?: string
          cycle_id?: string
          journey?: string
          status?: string
          decision_id?: string
          offered_at?: string
          accepted_at?: string | null
          activated_at?: string | null
          ended_at?: string | null
          end_reason?: string | null
          created_at?: string
          updated_at?: string
        };
      };
      media_assets: {
        Row: {
          id: string
          bucket: string
          path: string
          alt: string
          credit: string | null
          license: string
          license_proof_path: string | null
          usage_slot: string | null
          approved: boolean
          approved_by: string | null
          approved_at: string | null
          created_by: string | null
          created_at: string
        };
        Insert: {
          id?: string
          bucket?: string
          path: string
          alt: string
          credit?: string | null
          license: string
          license_proof_path?: string | null
          usage_slot?: string | null
          approved?: boolean
          approved_by?: string | null
          approved_at?: string | null
          created_by?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          bucket?: string
          path?: string
          alt?: string
          credit?: string | null
          license?: string
          license_proof_path?: string | null
          usage_slot?: string | null
          approved?: boolean
          approved_by?: string | null
          approved_at?: string | null
          created_by?: string | null
          created_at?: string
        };
      };
      membership_claims: {
        Row: {
          id: string
          user_id: string
          answer: string
          coach_name: string | null
          support_point: string | null
          no_polo: boolean
          created_at: string
        };
        Insert: {
          id?: string
          user_id: string
          answer: string
          coach_name?: string | null
          support_point?: string | null
          no_polo?: boolean
          created_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          answer?: string
          coach_name?: string | null
          support_point?: string | null
          no_polo?: boolean
          created_at?: string
        };
      };
      membership_verifications: {
        Row: {
          id: string
          user_id: string
          status: string
          previous_status: string | null
          source: string
          external_member_id: string | null
          note: string | null
          verified_by: string | null
          created_at: string
        };
        Insert: {
          id?: string
          user_id: string
          status: string
          previous_status?: string | null
          source: string
          external_member_id?: string | null
          note?: string | null
          verified_by?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          status?: string
          previous_status?: string | null
          source?: string
          external_member_id?: string | null
          note?: string | null
          verified_by?: string | null
          created_at?: string
        };
      };
      message_templates: {
        Row: {
          key: string
          channel: string
          kind: string
          subject: string
          preheader: string | null
          body: string
          cta_label: string | null
          cta_path: string | null
          active: boolean
          updated_by: string | null
          updated_at: string
        };
        Insert: {
          key: string
          channel?: string
          kind?: string
          subject: string
          preheader?: string | null
          body: string
          cta_label?: string | null
          cta_path?: string | null
          active?: boolean
          updated_by?: string | null
          updated_at?: string
        };
        Update: {
          key?: string
          channel?: string
          kind?: string
          subject?: string
          preheader?: string | null
          body?: string
          cta_label?: string | null
          cta_path?: string | null
          active?: boolean
          updated_by?: string | null
          updated_at?: string
        };
      };
      notifications: {
        Row: {
          id: string
          user_id: string
          kind: string
          title: string
          body: string | null
          action_url: string | null
          read_at: string | null
          created_at: string
        };
        Insert: {
          id?: string
          user_id: string
          kind: string
          title: string
          body?: string | null
          action_url?: string | null
          read_at?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          kind?: string
          title?: string
          body?: string | null
          action_url?: string | null
          read_at?: string | null
          created_at?: string
        };
      };
      partner_brand_permissions: {
        Row: {
          id: string
          partner_id: string
          document_path: string | null
          scope: string
          granted_on: string
          expires_on: string | null
          verified_by: string | null
          verified_at: string | null
          note: string | null
          created_at: string
        };
        Insert: {
          id?: string
          partner_id: string
          document_path?: string | null
          scope: string
          granted_on: string
          expires_on?: string | null
          verified_by?: string | null
          verified_at?: string | null
          note?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          partner_id?: string
          document_path?: string | null
          scope?: string
          granted_on?: string
          expires_on?: string | null
          verified_by?: string | null
          verified_at?: string | null
          note?: string | null
          created_at?: string
        };
      };
      partners: {
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          category: string
          website_url: string | null
          logo_path: string | null
          brand_authorized: boolean
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          status: string
          is_demo: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          slug: string
          name: string
          description?: string | null
          category: string
          website_url?: string | null
          logo_path?: string | null
          brand_authorized?: boolean
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          status?: string
          is_demo?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          slug?: string
          name?: string
          description?: string | null
          category?: string
          website_url?: string | null
          logo_path?: string | null
          brand_authorized?: boolean
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          status?: string
          is_demo?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        };
      };
      performance_marks: {
        Row: {
          id: string
          user_id: string
          distance: string
          seconds: number
          mark_date: string
          race_name: string | null
          evidence_document_id: string | null
          source: string
          verified_by: string | null
          verified_at: string | null
          created_at: string
        };
        Insert: {
          id?: string
          user_id: string
          distance: string
          seconds: number
          mark_date: string
          race_name?: string | null
          evidence_document_id?: string | null
          source?: string
          verified_by?: string | null
          verified_at?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          distance?: string
          seconds?: number
          mark_date?: string
          race_name?: string | null
          evidence_document_id?: string | null
          source?: string
          verified_by?: string | null
          verified_at?: string | null
          created_at?: string
        };
      };
      profiles: {
        Row: {
          user_id: string
          full_name: string
          preferred_name: string | null
          birth_date: string
          email: string
          phone_e164: string | null
          cep: string | null
          city: string | null
          uf: string | null
          country: string
          reference_category: string
          category_note: string | null
          origin_coach: string | null
          avatar_path: string | null
          public_profile: boolean
          ranking_opt_in: boolean
          passport_number: string
          passport_token: string
          passport_issued_at: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        };
        Insert: {
          user_id: string
          full_name: string
          preferred_name?: string | null
          birth_date: string
          email: string
          phone_e164?: string | null
          cep?: string | null
          city?: string | null
          uf?: string | null
          country?: string
          reference_category: string
          category_note?: string | null
          origin_coach?: string | null
          avatar_path?: string | null
          public_profile?: boolean
          ranking_opt_in?: boolean
          passport_number?: string
          passport_token?: string
          passport_issued_at?: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        };
        Update: {
          user_id?: string
          full_name?: string
          preferred_name?: string | null
          birth_date?: string
          email?: string
          phone_e164?: string | null
          cep?: string | null
          city?: string | null
          uf?: string | null
          country?: string
          reference_category?: string
          category_note?: string | null
          origin_coach?: string | null
          avatar_path?: string | null
          public_profile?: boolean
          ranking_opt_in?: boolean
          passport_number?: string
          passport_token?: string
          passport_issued_at?: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        };
      };
      program_cycles: {
        Row: {
          id: string
          slug: string
          name: string
          boston_year: number
          starts_on: string | null
          ends_on: string | null
          applications_open_at: string | null
          applications_close_at: string | null
          status: string
          is_current: boolean
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          slug: string
          name: string
          boston_year: number
          starts_on?: string | null
          ends_on?: string | null
          applications_open_at?: string | null
          applications_close_at?: string | null
          status?: string
          is_current?: boolean
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          slug?: string
          name?: string
          boston_year?: number
          starts_on?: string | null
          ends_on?: string | null
          applications_open_at?: string | null
          applications_close_at?: string | null
          status?: string
          is_current?: boolean
          created_at?: string
          updated_at?: string
        };
      };
      program_settings: {
        Row: {
          key: string
          value: Json
          status: string
          description: string
          updated_by: string | null
          updated_at: string
        };
        Insert: {
          key: string
          value: Json
          status?: string
          description: string
          updated_by?: string | null
          updated_at?: string
        };
        Update: {
          key?: string
          value?: Json
          status?: string
          description?: string
          updated_by?: string | null
          updated_at?: string
        };
      };
      qualification_standards: {
        Row: {
          id: string
          version_id: string
          category: string
          age_min: number
          age_max: number | null
          standard_seconds: number
        };
        Insert: {
          id?: string
          version_id: string
          category: string
          age_min: number
          age_max?: number | null
          standard_seconds: number
        };
        Update: {
          id?: string
          version_id?: string
          category?: string
          age_min?: number
          age_max?: number | null
          standard_seconds?: number
        };
      };
      rate_limits: {
        Row: {
          bucket: string
          window_start: string
          hits: number
        };
        Insert: {
          bucket: string
          window_start: string
          hits?: number
        };
        Update: {
          bucket?: string
          window_start?: string
          hits?: number
        };
      };
      reassessments: {
        Row: {
          id: string
          user_id: string
          application_id: string | null
          decision_id: string | null
          scheduled_for: string
          reason: string | null
          status: string
          created_by: string | null
          created_at: string
          done_at: string | null
        };
        Insert: {
          id?: string
          user_id: string
          application_id?: string | null
          decision_id?: string | null
          scheduled_for: string
          reason?: string | null
          status?: string
          created_by?: string | null
          created_at?: string
          done_at?: string | null
        };
        Update: {
          id?: string
          user_id?: string
          application_id?: string | null
          decision_id?: string | null
          scheduled_for?: string
          reason?: string | null
          status?: string
          created_by?: string | null
          created_at?: string
          done_at?: string | null
        };
      };
      redemption_events: {
        Row: {
          id: number
          redemption_id: string
          benefit_id: string
          partner_id: string
          user_id: string
          type: string
          actor_id: string | null
          payload: Json
          created_at: string
        };
        Insert: {
          id?: number
          redemption_id: string
          benefit_id: string
          partner_id: string
          user_id: string
          type: string
          actor_id?: string | null
          payload?: Json
          created_at?: string
        };
        Update: {
          id?: number
          redemption_id?: string
          benefit_id?: string
          partner_id?: string
          user_id?: string
          type?: string
          actor_id?: string | null
          payload?: Json
          created_at?: string
        };
      };
      redemption_secrets: {
        Row: {
          redemption_id: string
          user_id: string
          benefit_id: string
          display_code: string | null
          qr_token: string | null
          external_url: string | null
          created_at: string
        };
        Insert: {
          redemption_id: string
          user_id: string
          benefit_id: string
          display_code?: string | null
          qr_token?: string | null
          external_url?: string | null
          created_at?: string
        };
        Update: {
          redemption_id?: string
          user_id?: string
          benefit_id?: string
          display_code?: string | null
          qr_token?: string | null
          external_url?: string | null
          created_at?: string
        };
      };
      referral_sources: {
        Row: {
          id: string
          code: string
          kind: string
          label: string
          coach_user_id: string | null
          active: boolean
          created_at: string
        };
        Insert: {
          id?: string
          code: string
          kind: string
          label: string
          coach_user_id?: string | null
          active?: boolean
          created_at?: string
        };
        Update: {
          id?: string
          code?: string
          kind?: string
          label?: string
          coach_user_id?: string | null
          active?: boolean
          created_at?: string
        };
      };
      site_content: {
        Row: {
          key: string
          value: Json
          status: string
          legal_review: boolean
          updated_by: string | null
          updated_at: string
        };
        Insert: {
          key: string
          value: Json
          status?: string
          legal_review?: boolean
          updated_by?: string | null
          updated_at?: string
        };
        Update: {
          key?: string
          value?: Json
          status?: string
          legal_review?: boolean
          updated_by?: string | null
          updated_at?: string
        };
      };
      staff_directory: {
        Row: {
          user_id: string
          display_name: string
          title: string | null
          polo: string | null
          active: boolean
          created_at: string
          updated_at: string
        };
        Insert: {
          user_id: string
          display_name: string
          title?: string | null
          polo?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        };
        Update: {
          user_id?: string
          display_name?: string
          title?: string | null
          polo?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        };
      };
      standard_versions: {
        Row: {
          id: string
          label: string
          applies_to_years: number[]
          race_date: string
          age_reference: string
          min_age: number
          source_url: string
          source_title: string
          consulted_at: string
          notes: string | null
          status: string
          published_by: string | null
          published_at: string | null
          created_at: string
        };
        Insert: {
          id?: string
          label: string
          applies_to_years: number[]
          race_date: string
          age_reference?: string
          min_age?: number
          source_url: string
          source_title: string
          consulted_at: string
          notes?: string | null
          status?: string
          published_by?: string | null
          published_at?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          label?: string
          applies_to_years?: number[]
          race_date?: string
          age_reference?: string
          min_age?: number
          source_url?: string
          source_title?: string
          consulted_at?: string
          notes?: string | null
          status?: string
          published_by?: string | null
          published_at?: string | null
          created_at?: string
        };
      };
      subscription_links: {
        Row: {
          id: string
          user_id: string
          provider: string
          external_ref: string | null
          status: string
          observed_at: string
          created_by: string | null
          created_at: string
        };
        Insert: {
          id?: string
          user_id: string
          provider: string
          external_ref?: string | null
          status?: string
          observed_at?: string
          created_by?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          provider?: string
          external_ref?: string | null
          status?: string
          observed_at?: string
          created_by?: string | null
          created_at?: string
        };
      };
      sync_runs: {
        Row: {
          id: string
          provider: string
          started_at: string
          finished_at: string | null
          status: string
          stats: Json
          error: string | null
          triggered_by: string | null
        };
        Insert: {
          id?: string
          provider: string
          started_at?: string
          finished_at?: string | null
          status?: string
          stats?: Json
          error?: string | null
          triggered_by?: string | null
        };
        Update: {
          id?: string
          provider?: string
          started_at?: string
          finished_at?: string | null
          status?: string
          stats?: Json
          error?: string | null
          triggered_by?: string | null
        };
      };
      target_races: {
        Row: {
          id: string
          slug: string
          name: string
          city: string
          country: string
          race_date: string | null
          race_date_confirmed: boolean
          enrollment_deadline: string | null
          deadline_confirmed: boolean
          sixteen_weeks_checked: boolean
          official_url: string | null
          status: string
          sort_order: number
          notes: string | null
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          slug: string
          name: string
          city: string
          country: string
          race_date?: string | null
          race_date_confirmed?: boolean
          enrollment_deadline?: string | null
          deadline_confirmed?: boolean
          sixteen_weeks_checked?: boolean
          official_url?: string | null
          status?: string
          sort_order?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          slug?: string
          name?: string
          city?: string
          country?: string
          race_date?: string | null
          race_date_confirmed?: boolean
          enrollment_deadline?: string | null
          deadline_confirmed?: boolean
          sixteen_weeks_checked?: boolean
          official_url?: string | null
          status?: string
          sort_order?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        };
      };
      technical_decisions: {
        Row: {
          id: string
          application_id: string
          user_id: string
          decision: string
          reason: string
          next_step: string
          next_step_on: string | null
          message_to_athlete: string | null
          decided_by: string
          decided_role: string
          supersedes_id: string | null
          from_status: string
          to_status: string
          idempotency_key: string
          created_at: string
        };
        Insert: {
          id?: string
          application_id: string
          user_id: string
          decision: string
          reason: string
          next_step: string
          next_step_on?: string | null
          message_to_athlete?: string | null
          decided_by: string
          decided_role: string
          supersedes_id?: string | null
          from_status: string
          to_status: string
          idempotency_key: string
          created_at?: string
        };
        Update: {
          id?: string
          application_id?: string
          user_id?: string
          decision?: string
          reason?: string
          next_step?: string
          next_step_on?: string | null
          message_to_athlete?: string | null
          decided_by?: string
          decided_role?: string
          supersedes_id?: string | null
          from_status?: string
          to_status?: string
          idempotency_key?: string
          created_at?: string
        };
      };
      technical_reviews: {
        Row: {
          id: string
          application_id: string
          author_id: string
          note: string
          created_at: string
        };
        Insert: {
          id?: string
          application_id: string
          author_id: string
          note: string
          created_at?: string
        };
        Update: {
          id?: string
          application_id?: string
          author_id?: string
          note?: string
          created_at?: string
        };
      };
      test_results: {
        Row: {
          id: string
          test_id: string
          user_id: string
          seconds: number
          evidence_document_id: string | null
          source: string
          status: string
          validated_by: string | null
          validated_at: string | null
          review_note: string | null
          equivalent_marathon_seconds: number | null
          reference_seconds: number | null
          normalized_pct: number | null
          level: string | null
          formula_version: string | null
          created_at: string
        };
        Insert: {
          id?: string
          test_id: string
          user_id: string
          seconds: number
          evidence_document_id?: string | null
          source?: string
          status?: string
          validated_by?: string | null
          validated_at?: string | null
          review_note?: string | null
          equivalent_marathon_seconds?: number | null
          reference_seconds?: number | null
          normalized_pct?: number | null
          level?: string | null
          formula_version?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          test_id?: string
          user_id?: string
          seconds?: number
          evidence_document_id?: string | null
          source?: string
          status?: string
          validated_by?: string | null
          validated_at?: string | null
          review_note?: string | null
          equivalent_marathon_seconds?: number | null
          reference_seconds?: number | null
          normalized_pct?: number | null
          level?: string | null
          formula_version?: string | null
          created_at?: string
        };
      };
      tests: {
        Row: {
          id: string
          cycle_id: string
          slug: string
          name: string
          distance_m: number | null
          planned_month: string
          test_date: string | null
          date_confirmed: boolean
          format_note: string | null
          badge_slug: string | null
          status: string
          created_at: string
        };
        Insert: {
          id?: string
          cycle_id: string
          slug: string
          name: string
          distance_m?: number | null
          planned_month: string
          test_date?: string | null
          date_confirmed?: boolean
          format_note?: string | null
          badge_slug?: string | null
          status?: string
          created_at?: string
        };
        Update: {
          id?: string
          cycle_id?: string
          slug?: string
          name?: string
          distance_m?: number | null
          planned_month?: string
          test_date?: string | null
          date_confirmed?: boolean
          format_note?: string | null
          badge_slug?: string | null
          status?: string
          created_at?: string
        };
      };
      training_goals: {
        Row: {
          id: string
          user_id: string
          journey: string
          title: string
          description: string | null
          target_distance: string | null
          target_seconds: number | null
          due_on: string | null
          status: string
          created_by: string
          created_at: string
          updated_at: string
        };
        Insert: {
          id?: string
          user_id: string
          journey: string
          title: string
          description?: string | null
          target_distance?: string | null
          target_seconds?: number | null
          due_on?: string | null
          status?: string
          created_by: string
          created_at?: string
          updated_at?: string
        };
        Update: {
          id?: string
          user_id?: string
          journey?: string
          title?: string
          description?: string | null
          target_distance?: string | null
          target_seconds?: number | null
          due_on?: string | null
          status?: string
          created_by?: string
          created_at?: string
          updated_at?: string
        };
      };
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: string
          scope_polo: string | null
          partner_id: string | null
          granted_by: string | null
          granted_at: string
          revoked_by: string | null
          revoked_at: string | null
          note: string | null
        };
        Insert: {
          id?: string
          user_id: string
          role: string
          scope_polo?: string | null
          partner_id?: string | null
          granted_by?: string | null
          granted_at?: string
          revoked_by?: string | null
          revoked_at?: string | null
          note?: string | null
        };
        Update: {
          id?: string
          user_id?: string
          role?: string
          scope_polo?: string | null
          partner_id?: string | null
          granted_by?: string | null
          granted_at?: string
          revoked_by?: string | null
          revoked_at?: string | null
          note?: string | null
        };
      };
      utm_attributions: {
        Row: {
          id: string
          user_id: string | null
          anon_key: string | null
          touch: string
          source: string | null
          medium: string | null
          campaign: string | null
          term: string | null
          content: string | null
          referrer_host: string | null
          landing_path: string | null
          referral_code: string | null
          created_at: string
        };
        Insert: {
          id?: string
          user_id?: string | null
          anon_key?: string | null
          touch?: string
          source?: string | null
          medium?: string | null
          campaign?: string | null
          term?: string | null
          content?: string | null
          referrer_host?: string | null
          landing_path?: string | null
          referral_code?: string | null
          created_at?: string
        };
        Update: {
          id?: string
          user_id?: string | null
          anon_key?: string | null
          touch?: string
          source?: string | null
          medium?: string | null
          campaign?: string | null
          term?: string | null
          content?: string | null
          referrer_host?: string | null
          landing_path?: string | null
          referral_code?: string | null
          created_at?: string
        };
      };
    };
    Views: {
      os_candidates: {
        Row: {
          application_id: string | null
          user_id: string | null
          status: string | null
          prelim_result: string | null
          prelim_reasons: string[] | null
          category: string | null
          age_on_race_day: number | null
          age_group: string | null
          standard_seconds: number | null
          projected_marathon_seconds: number | null
          gap_seconds: number | null
          target_race_choice: string | null
          target_race_id: string | null
          target_race_name: string | null
          sessions_4plus: boolean | null
          late_entry: boolean | null
          submitted_at: string | null
          sla_due_at: string | null
          first_contact_at: string | null
          reviewer_id: string | null
          next_reassessment_on: string | null
          created_at: string | null
          updated_at: string | null
          full_name: string | null
          email: string | null
          phone_e164: string | null
          city: string | null
          uf: string | null
          passport_number: string | null
          birth_date: string | null
          membership_declared: string | null
          membership_verified: string | null
          access_status: string | null
          journey_status: string | null
          polo: string | null
          automations_paused: boolean | null
          mark_distance: string | null
          mark_seconds: number | null
          mark_date: string | null
          mark_race_name: string | null
          reviewer_name: string | null
          open_journey_status: string | null
          open_journey: string | null
        };
      };
      os_members: {
        Row: {
          user_id: string | null
          full_name: string | null
          email: string | null
          phone_e164: string | null
          city: string | null
          uf: string | null
          passport_number: string | null
          created_at: string | null
          membership_declared: string | null
          membership_verified: string | null
          access_status: string | null
          journey_status: string | null
          polo: string | null
          declared_coach: string | null
          declared_support_point: string | null
          declared_no_polo: boolean | null
          declared_at: string | null
          verified_at: string | null
        };
      };
      os_ranking: {
        Row: {
          result_id: string | null
          test_id: string | null
          test_name: string | null
          planned_month: string | null
          user_id: string | null
          full_name: string | null
          city: string | null
          uf: string | null
          polo: string | null
          journey_status: string | null
          seconds: number | null
          status: string | null
          normalized_pct: number | null
          level: string | null
          formula_version: string | null
          ranking_opt_in: boolean | null
          position: number | null
        };
      };
      v_public_content: {
        Row: {
          key: string | null
          value: Json | null
          legal_review: boolean | null
          updated_at: string | null
        };
      };
      v_public_cycle: {
        Row: {
          slug: string | null
          name: string | null
          boston_year: number | null
          starts_on: string | null
          ends_on: string | null
          applications_open_at: string | null
          applications_close_at: string | null
          status: string | null
        };
      };
      v_public_media: {
        Row: {
          id: string | null
          bucket: string | null
          path: string | null
          alt: string | null
          credit: string | null
          usage_slot: string | null
        };
      };
      v_public_races: {
        Row: {
          id: string | null
          slug: string | null
          name: string | null
          city: string | null
          country: string | null
          race_date: string | null
          race_date_confirmed: boolean | null
          enrollment_deadline: string | null
          deadline_confirmed: boolean | null
          sixteen_weeks_checked: boolean | null
          official_url: string | null
          status: string | null
          sort_order: number | null
        };
      };
      v_public_ranking: {
        Row: {
          test_id: string | null
          test_name: string | null
          planned_month: string | null
          display_name: string | null
          city: string | null
          uf: string | null
          polo: string | null
          normalized_pct: number | null
          level: string | null
          position: number | null
        };
      };
      v_public_standards: {
        Row: {
          version_id: string | null
          label: string | null
          applies_to_years: number[] | null
          race_date: string | null
          min_age: number | null
          source_url: string | null
          source_title: string | null
          consulted_at: string | null
          notes: string | null
          category: string | null
          age_min: number | null
          age_max: number | null
          standard_seconds: number | null
        };
      };
      v_public_tests: {
        Row: {
          id: string | null
          slug: string | null
          name: string | null
          distance_m: number | null
          planned_month: string | null
          test_date: string | null
          date_confirmed: boolean | null
          format_note: string | null
          status: string | null
        };
      };
    };
    Functions: {
      accept_journey: { Args: "p_enrollment_id uuid"; Returns: "jsonb" };
      active_standard_version: { Args: ""; Returns: "uuid" };
      add_business_days: { Args: "p_from timestamp with time zone, p_days integer"; Returns: "timestamp with time zone" };
      add_my_document: { Args: "p_application_id uuid, p_kind text, p_storage_path text, p_mime text, p_size integer, p_original_name text"; Returns: "uuid" };
      add_review_note: { Args: "p_application_id uuid, p_note text"; Returns: "uuid" };
      age_group_label: { Args: "p_version uuid, p_category text, p_age integer"; Returns: "text" };
      age_on: { Args: "p_birth date, p_on date"; Returns: "integer" };
      anonymize_athlete: { Args: "p_user uuid, p_request_id uuid"; Returns: "void" };
      append_audit_event: { Args: "p_action text, p_entity text, p_entity_id text, p_data jsonb DEFAULT '{}'::jsonb"; Returns: "void" };
      approve_manual_redemption: { Args: "p_redemption_id uuid, p_code text"; Returns: "void" };
      assign_coach: { Args: "p_athlete uuid, p_coach uuid"; Returns: "void" };
      audit_row_change: { Args: ""; Returns: "trigger" };
      award_badge: { Args: "p_user_id uuid, p_badge_slug text, p_source_ref text, p_note text DEFAULT NULL::text"; Returns: "uuid" };
      benefit_eligibility: { Args: "p_benefit_id uuid, p_user uuid"; Returns: "jsonb" };
      block_direct_mutation: { Args: ""; Returns: "trigger" };
      block_mutation: { Args: ""; Returns: "trigger" };
      can_coach_athlete: { Args: "p_athlete uuid"; Returns: "boolean" };
      can_see_athlete: { Args: "p_athlete uuid"; Returns: "boolean" };
      cancel_redemption: { Args: "p_redemption_id uuid, p_reason text, p_return_stock boolean"; Returns: "void" };
      claim_benefit: { Args: "p_benefit_id uuid, p_idempotency_key text, p_accept_terms boolean"; Returns: "jsonb" };
      claim_simulations: { Args: "p_anon_key text"; Returns: "integer" };
      compute_prelim: { Args: "p_birth date, p_category text, p_distance text, p_seconds integer, p_mark_date date, p_target_choice text, p_target_race uuid, p_sessions_4plus boolean, p_injury boolean, p_today date DEFAULT NULL::date"; Returns: "jsonb" };
      current_cycle_id: { Args: ""; Returns: "uuid" };
      decline_journey: { Args: "p_enrollment_id uuid, p_reason text"; Returns: "void" };
      duplicate_benefit: { Args: "p_benefit_id uuid"; Returns: "uuid" };
      equivalent_marathon: { Args: "p_seconds integer, p_distance_m integer"; Returns: "integer" };
      expire_redemptions: { Args: ""; Returns: "integer" };
      first_name: { Args: "p_user uuid"; Returns: "text" };
      flag: { Args: "p_key text"; Returns: "boolean" };
      grant_role: { Args: "p_user uuid, p_role text, p_scope_polo text, p_partner uuid, p_note text"; Returns: "uuid" };
      guard_enrollment_decision: { Args: ""; Returns: "trigger" };
      guard_published_standards: { Args: ""; Returns: "trigger" };
      handle_data_request: { Args: "p_id uuid, p_status text, p_response text"; Returns: "void" };
      has_any_role: { Args: "p_roles text[]"; Returns: "boolean" };
      has_consent: { Args: "p_user uuid, p_purpose text"; Returns: "boolean" };
      has_role: { Args: "p_role text"; Returns: "boolean" };
      hit_rate_limit: { Args: "p_bucket text, p_max integer, p_window_seconds integer"; Returns: "boolean" };
      is_assigned_coach: { Args: "p_athlete uuid"; Returns: "boolean" };
      is_staff: { Args: ""; Returns: "boolean" };
      level_for_pct: { Args: "p_pct numeric"; Returns: "text" };
      load_benefit_codes: { Args: "p_benefit_id uuid, p_codes text[]"; Returns: "integer" };
      lookup_standard: { Args: "p_version uuid, p_category text, p_age integer"; Returns: "integer" };
      mark_notifications_read: { Args: "p_ids uuid[]"; Returns: "integer" };
      my_benefit_catalog: { Args: ""; Returns: "TABLE(id uuid, slug text, title text, summary text, category text, partner_name text, partner_slug text, partner_logo_path text, image_path text, mode text, journey_scope text, requires_active_member boolean, starts_at timestamp with time zone, ends_at timestamp with time zone, remaining_quantity integer, total_quantity integer, eligible boolean, lock_reason text, is_demo boolean)" };
      my_benefit_detail: { Args: "p_slug text"; Returns: "jsonb" };
      my_redemptions: { Args: ""; Returns: "TABLE(id uuid, status text, created_at timestamp with time zone, issued_at timestamp with time zone, expires_at timestamp with time zone, redeemed_at timestamp with time zone, cancel_reason text, title text, mode text, redemption_instructions text, is_demo boolean, display_code text, qr_token text, external_url text)" };
      notify: { Args: "p_user uuid, p_kind text, p_title text, p_body text, p_url text"; Returns: "void" };
      notify_role: { Args: "p_role text, p_kind text, p_title text, p_body text, p_url text"; Returns: "void" };
      os_funnel: { Args: "p_from timestamp with time zone, p_to timestamp with time zone, p_dimension text"; Returns: "TABLE(label text, simulations bigint, signups bigint, applications bigint, eligible bigint, almost bigint, approved bigint, next_forwarded bigint)" };
      os_overview: { Args: "p_from timestamp with time zone, p_to timestamp with time zone"; Returns: "jsonb" };
      outbox_claim: { Args: "p_limit integer"; Returns: "SETOF rtb.email_outbox" };
      outbox_provider_event: { Args: "p_provider text, p_event_id text, p_provider_message_id text, p_type text, p_payload jsonb"; Returns: "void" };
      outbox_result: { Args: "p_id uuid, p_ok boolean, p_provider text, p_provider_id text, p_error text"; Returns: "void" };
      publish_standard_version: { Args: "p_version_id uuid"; Returns: "void" };
      queue_email: { Args: "p_user uuid, p_template text, p_vars jsonb, p_idempotency_key text"; Returns: "void" };
      random_code: { Args: "p_len integer DEFAULT 8"; Returns: "text" };
      record_consents: { Args: "p_items jsonb, p_policy_version text"; Returns: "void" };
      record_contact_attempt: { Args: "p_application_id uuid, p_channel text, p_outcome text, p_note text"; Returns: "uuid" };
      record_technical_decision: { Args: "p_application_id uuid, p_decision text, p_reason text, p_next_step text, p_next_step_on date, p_message_to_athlete text, p_idempotency_key text"; Returns: "jsonb" };
      request_data: { Args: "p_kind text, p_details text"; Returns: "uuid" };
      require_any_role: { Args: "p_roles text[]"; Returns: "uuid" };
      require_uid: { Args: ""; Returns: "uuid" };
      respond_info_request: { Args: "p_request_id uuid, p_response text, p_document_id uuid DEFAULT NULL::uuid"; Returns: "void" };
      revoke_role: { Args: "p_role_id uuid, p_note text"; Returns: "void" };
      role_allows_polo: { Args: "p_role text, p_polo text"; Returns: "boolean" };
      save_membership_claim: { Args: "p_answer text, p_coach_name text, p_support_point text, p_no_polo boolean"; Returns: "void" };
      save_my_profile: { Args: "p jsonb"; Returns: "jsonb" };
      save_simulation: { Args: "p_birth date, p_category text, p_distance text, p_seconds integer, p_mark_date date, p_race_name text, p_anon_key text, p_idempotency_key text, p_ip_hash text, p_user uuid DEFAULT NULL::uuid"; Returns: "jsonb" };
      save_training_goal: { Args: "p_id uuid, p_user_id uuid, p jsonb"; Returns: "uuid" };
      schedule_reassessment: { Args: "p_user_id uuid, p_application_id uuid, p_date date, p_reason text"; Returns: "uuid" };
      set_athlete_polo: { Args: "p_user_id uuid, p_polo text"; Returns: "void" };
      set_automations_paused: { Args: "p_user_id uuid, p_paused boolean"; Returns: "void" };
      set_my_avatar: { Args: "p_path text"; Returns: "void" };
      setting: { Args: "p_key text"; Returns: "jsonb" };
      sla_tick: { Args: ""; Returns: "jsonb" };
      staff_by_role: { Args: "p_role text"; Returns: "TABLE(user_id uuid, display_name text)" };
      stamp: { Args: "p_user uuid, p_badge_slug text, p_source_ref text"; Returns: "void" };
      start_review: { Args: "p_application_id uuid"; Returns: "void" };
      submit_application: { Args: "p jsonb, p_idempotency_key text"; Returns: "jsonb" };
      submit_test_result: { Args: "p_test_id uuid, p_seconds integer, p_document_id uuid DEFAULT NULL::uuid"; Returns: "uuid" };
      touch_updated_at: { Args: ""; Returns: "trigger" };
      track_benefit_view: { Args: "p_benefit_id uuid"; Returns: "void" };
      update_opportunity: { Args: "p_id uuid, p_status text, p_owner uuid, p_next_action text, p_next_action_on date, p_note text, p_lost_reason text DEFAULT NULL::text"; Returns: "void" };
      user_id_by_email: { Args: "p_email text"; Returns: "uuid" };
      validate_redemption: { Args: "p_token text, p_code text, p_benefit_id uuid, p_idempotency_key text"; Returns: "jsonb" };
      validate_test_result: { Args: "p_result_id uuid, p_status text, p_note text"; Returns: "jsonb" };
      verify_member_link: { Args: "p_user_id uuid, p_status text, p_source text, p_note text, p_external_member_id text DEFAULT NULL::text"; Returns: "jsonb" };
      withdraw_application: { Args: "p_application_id uuid, p_reason text"; Returns: "void" };
    };
  };
};
