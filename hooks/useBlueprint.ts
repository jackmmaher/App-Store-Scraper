import { useState, useCallback, useEffect } from 'react';
import type { ProjectBlueprint, BlueprintAttachment, BlueprintSection } from '@/lib/supabase';

interface UseBlueprintProps {
  projectId: string;
}

export function useBlueprint({ projectId }: UseBlueprintProps) {
  const [blueprint, setBlueprint] = useState<ProjectBlueprint | null>(null);
  const [attachments, setAttachments] = useState<BlueprintAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load blueprint for project (creates if doesn't exist)
  const loadBlueprint = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/blueprint?projectId=${projectId}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch blueprint');
      }
      const data = await res.json();
      setBlueprint(data.blueprint);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load blueprint');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Reload blueprint by ID
  const reloadBlueprint = useCallback(async (blueprintId: string) => {
    try {
      const res = await fetch(`/api/blueprint?id=${blueprintId}`);
      if (!res.ok) throw new Error('Failed to fetch blueprint');
      const data = await res.json();
      setBlueprint(data.blueprint);
    } catch (err) {
      console.error('Failed to reload blueprint:', err);
    }
  }, []);

  // Update section content
  const updateSection = useCallback(async (
    section: BlueprintSection,
    content: string
  ): Promise<boolean> => {
    if (!blueprint) return false;

    try {
      const res = await fetch(`/api/blueprint?id=${blueprint.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, content }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update section');
      }

      const data = await res.json();
      setBlueprint(data.blueprint);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update section');
      return false;
    }
  }, [blueprint]);

  // Delete blueprint
  const deleteBlueprint = useCallback(async (): Promise<boolean> => {
    if (!blueprint) return false;

    try {
      const res = await fetch(`/api/blueprint?id=${blueprint.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete blueprint');
      setBlueprint(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete blueprint');
      return false;
    }
  }, [blueprint]);

  // Upload attachment
  const uploadAttachment = useCallback(async (
    section: BlueprintSection,
    file: File,
    screenLabel?: string
  ): Promise<BlueprintAttachment | null> => {
    if (!blueprint) return null;

    try {
      const formData = new FormData();
      formData.append('blueprintId', blueprint.id);
      formData.append('section', section);
      if (screenLabel) {
        formData.append('screenLabel', screenLabel);
      }
      formData.append('file', file);

      const res = await fetch('/api/blueprint/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to upload file');
      }

      const data = await res.json();
      setAttachments((prev) => [...prev, data.attachment]);
      return data.attachment;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file');
      return null;
    }
  }, [blueprint]);

  // Delete attachment
  const deleteAttachment = useCallback(async (attachmentId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/blueprint/upload?attachmentId=${attachmentId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete attachment');
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete attachment');
      return false;
    }
  }, []);

  // Get export URL
  const getExportUrl = useCallback((): string | null => {
    if (!blueprint) return null;
    return `/api/blueprint/export?id=${blueprint.id}`;
  }, [blueprint]);

  // Refresh attachments from server
  const refreshAttachments = useCallback(async () => {
    if (!blueprint) return;

    try {
      const res = await fetch(`/api/blueprint?id=${blueprint.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.attachments) {
          setAttachments(data.attachments);
        }
      }
    } catch (err) {
      console.error('Failed to refresh attachments:', err);
    }
  }, [blueprint]);

  // Load blueprint on mount
  useEffect(() => {
    if (projectId) {
      loadBlueprint();
    }
  }, [projectId, loadBlueprint]);

  return {
    // State
    blueprint,
    attachments,
    loading,
    error,

    // Actions
    loadBlueprint,
    reloadBlueprint,
    updateSection,
    deleteBlueprint,
    uploadAttachment,
    deleteAttachment,
    refreshAttachments,
    getExportUrl,
    clearError: () => setError(null),
    setBlueprint,
  };
}
