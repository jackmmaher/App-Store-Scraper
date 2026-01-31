// Keyword Clustering Module
// Uses Claude to group raw keywords into semantically related "app concept" clusters

import { Cluster, ClusteringPromptResult, DiscoveredKeyword } from './types';

/**
 * Generate a unique cluster ID
 */
function generateClusterId(): string {
  return `cluster_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Call Claude to cluster keywords into app concepts
 */
export async function clusterKeywords(
  keywords: DiscoveredKeyword[],
  apiKey: string
): Promise<Cluster[]> {
  // Deduplicate and get unique keyword terms
  const uniqueKeywords = [...new Set(keywords.map(k => k.term.toLowerCase()))];

  // Limit to 100 keywords for reasonable API costs
  const keywordList = uniqueKeywords.slice(0, 100);

  const systemPrompt = `You are an app market research expert. Your task is to analyze a list of App Store search keywords and group them into distinct "app concepts" - clusters that represent different types of apps a developer could build.

Rules:
1. Create 5-8 clusters maximum
2. Each cluster should represent a distinct app concept or user need
3. Keywords can only belong to one cluster
4. Name each cluster descriptively (e.g., "Timer & Focus Apps", "Habit Trackers")
5. Provide a short theme description for each cluster
6. Exclude generic or overly broad keywords that don't fit any concept
7. Prioritize clusters with more commercial potential

Return your response as valid JSON with this exact structure:
{
  "clusters": [
    {
      "name": "Cluster Name",
      "keywords": ["keyword1", "keyword2", ...],
      "theme": "Brief description of what apps in this cluster would do"
    }
  ]
}`;

  const userPrompt = `Analyze these ${keywordList.length} App Store keywords and group them into 5-8 distinct app concept clusters:

${keywordList.join('\n')}

Return valid JSON only, no markdown or explanation.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Claude API error during clustering:', error);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.content[0]?.text || '';

    // Parse the JSON response
    const result = parseClusteringResponse(responseText);

    // Convert to our Cluster type with IDs
    return result.clusters.map(c => ({
      id: generateClusterId(),
      name: c.name,
      keywords: c.keywords,
      theme: c.theme,
      keywordCount: c.keywords.length,
    }));
  } catch (error) {
    console.error('Error clustering keywords:', error);
    throw error;
  }
}

/**
 * Parse Claude's clustering response
 */
function parseClusteringResponse(responseText: string): ClusteringPromptResult {
  // Try to extract JSON from the response
  let jsonStr = responseText.trim();

  // Handle markdown code blocks
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate structure
    if (!parsed.clusters || !Array.isArray(parsed.clusters)) {
      throw new Error('Invalid response structure: missing clusters array');
    }

    // Validate each cluster
    for (const cluster of parsed.clusters) {
      if (!cluster.name || !cluster.keywords || !cluster.theme) {
        throw new Error('Invalid cluster structure: missing required fields');
      }
      if (!Array.isArray(cluster.keywords)) {
        throw new Error('Invalid cluster structure: keywords must be an array');
      }
    }

    return parsed as ClusteringPromptResult;
  } catch (parseError) {
    console.error('Failed to parse clustering response:', parseError);
    console.error('Raw response:', responseText);
    throw new Error('Failed to parse Claude clustering response');
  }
}

/**
 * Merge two clusters together
 */
export function mergeClusters(cluster1: Cluster, cluster2: Cluster, newName: string): Cluster {
  const mergedKeywords = [...new Set([...cluster1.keywords, ...cluster2.keywords])];

  return {
    id: generateClusterId(),
    name: newName,
    keywords: mergedKeywords,
    theme: `${cluster1.theme} + ${cluster2.theme}`,
    keywordCount: mergedKeywords.length,
  };
}

/**
 * Split a cluster into two based on a keyword subset
 */
export function splitCluster(
  cluster: Cluster,
  keywordsForNewCluster: string[],
  newClusterName: string
): [Cluster, Cluster] {
  const remainingKeywords = cluster.keywords.filter(
    k => !keywordsForNewCluster.includes(k)
  );

  const originalUpdated: Cluster = {
    ...cluster,
    keywords: remainingKeywords,
    keywordCount: remainingKeywords.length,
  };

  const newCluster: Cluster = {
    id: generateClusterId(),
    name: newClusterName,
    keywords: keywordsForNewCluster,
    theme: 'User-defined split',
    keywordCount: keywordsForNewCluster.length,
  };

  return [originalUpdated, newCluster];
}

/**
 * Rename a cluster
 */
export function renameCluster(cluster: Cluster, newName: string): Cluster {
  return {
    ...cluster,
    name: newName,
  };
}

/**
 * Remove a cluster (returns updated array)
 */
export function removeCluster(clusters: Cluster[], clusterId: string): Cluster[] {
  return clusters.filter(c => c.id !== clusterId);
}
