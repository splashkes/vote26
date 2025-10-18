import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Flex,
  Text,
  TextField,
  Select,
  Badge,
  Table,
  Spinner,
  Card,
  Heading,
  Button,
  Dialog,
  Separator,
  Checkbox,
  Tabs,
  Code
} from '@radix-ui/themes';
import {
  MagnifyingGlassIcon,
  ReloadIcon,
  InfoCircledIcon,
  CalendarIcon,
  CrossCircledIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { filterFindings, getSeverityCounts } from '../lib/eventLinter';
import { formatDateForDisplay } from '../lib/dateUtils';

const EventLinter = () => {
  const [findings, setFindings] = useState([]);
  const [allFindings, setAllFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilters, setSeverityFilters] = useState(new Set());
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [contextFilter, setContextFilter] = useState('all');
  const [futureOnly, setFutureOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [hideArtistFindings, setHideArtistFindings] = useState(false);
  const [hideEventFindings, setHideEventFindings] = useState(false);
  const [hideCityFindings, setHideCityFindings] = useState(false);
  const [showOnlyOverview, setShowOnlyOverview] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [findingDialogOpen, setFindingDialogOpen] = useState(false);
  const [rules, setRules] = useState([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [suppressing, setSuppressing] = useState(false);
  const [suppressReason, setSuppressReason] = useState('');
  const [suppressDuration, setSuppressDuration] = useState('forever');
  const [activeTab, setActiveTab] = useState('findings');
  const [selectedRule, setSelectedRule] = useState(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [testingRule, setTestingRule] = useState(false);
  const [ruleTestResults, setRuleTestResults] = useState(null);

  // AI Analysis state
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [showAIAnalysis, setShowAIAnalysis] = useState(false);
  const [aiAnalysisTime, setAiAnalysisTime] = useState(0);
  const aiTimerRef = useRef(null);

  // Load events and run linter via edge function with streaming
  const runLinter = async () => {
    try {
      setLoading(true);
      setAllFindings([]); // Clear previous findings
      setFindings([]);

      // Call edge function with streaming
      const { data: { session } } = await supabase.auth.getSession();
      const url = new URL(`${import.meta.env.VITE_SUPABASE_URL || 'https://xsqdkubgyqwpyvfltnrf.supabase.co'}/functions/v1/event-linter`);
      if (futureOnly) url.searchParams.append('future', 'true');
      if (activeOnly) url.searchParams.append('active', 'true');
      url.searchParams.append('stream', 'true'); // Enable streaming

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Read the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedFindings = [];
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('Stream complete');
          setLoading(false);
          break;
        }

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (end with \n\n)
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || ''; // Keep incomplete message in buffer

        for (const message of messages) {
          if (!message.trim() || !message.startsWith('data: ')) continue;

          try {
            const jsonStr = message.replace(/^data: /, '');
            const data = JSON.parse(jsonStr);

            if (data.complete) {
              // Stream complete
              console.log('Linter complete:', data.summary);
              console.log('Debug info:', data.debug);
              if (data.debug?.rules) {
                setRules(data.debug.rules);
              } else {
                setRules({ length: data.debug?.rules_loaded || 0 });
              }
              setLoading(false);
            } else if (data.progress) {
              // Progress update
              console.log(`[${data.phase}] ${data.progress}`);
            } else if (data.phase && data.findings) {
              // New findings batch
              console.log(`Received ${data.findings.length} findings from phase: ${data.phase}`);
              accumulatedFindings = [...accumulatedFindings, ...data.findings];
              setAllFindings(accumulatedFindings); // useEffect will filter and update findings
            } else if (data.error) {
              // Error occurred
              console.error('Linter error:', data.error, data.debug);
              setLoading(false);
              break;
            }
          } catch (parseError) {
            console.error('Error parsing SSE message:', parseError, message);
          }
        }
      }

    } catch (err) {
      console.error('Error running linter:', err);
      setLoading(false);

      // Fallback to non-streaming if streaming fails
      console.log('Falling back to non-streaming mode...');
      runLinterNonStreaming();
    }
  };

  // Fallback non-streaming version
  const runLinterNonStreaming = async () => {
    try {
      setLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      const url = new URL(`${import.meta.env.VITE_SUPABASE_URL || 'https://xsqdkubgyqwpyvfltnrf.supabase.co'}/functions/v1/event-linter`);
      if (futureOnly) url.searchParams.append('future', 'true');
      if (activeOnly) url.searchParams.append('active', 'true');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('Linter error:', result);
        throw new Error(result.error || 'Failed to run linter');
      }

      setRules({ length: result.rules_count || 0 });
      setAllFindings(result.findings || []);
      setFindings(result.findings || []);

      console.log('Linter debug info:', result.debug);
    } catch (err) {
      console.error('Error running linter:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSuppress = async () => {
    if (!selectedFinding) return;

    try {
      setSuppressing(true);

      // Calculate suppressed_until based on duration
      let suppressedUntil = null;
      if (suppressDuration !== 'forever') {
        const now = new Date();
        const days = parseInt(suppressDuration);
        suppressedUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Upsert suppression (update if exists, insert if not)
      const { error } = await supabase
        .from('linter_suppressions')
        .upsert({
          rule_id: selectedFinding.ruleId,
          event_id: selectedFinding.eventId || null,
          artist_id: selectedFinding.artistId || null,
          suppressed_by: user?.id,
          suppressed_until: suppressedUntil,
          reason: suppressReason || null
        }, {
          onConflict: 'rule_id,event_id,artist_id',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('Error suppressing finding:', error);
        alert(`Failed to suppress: ${error.message}`);
        return;
      }

      alert('Finding suppressed successfully!');
      setFindingDialogOpen(false);
      setSuppressReason('');
      setSuppressDuration('forever');

      // Reload findings
      await runLinter();
    } catch (err) {
      console.error('Error suppressing finding:', err);
      alert(`Error: ${err.message}`);
    } finally {
      setSuppressing(false);
    }
  };

  useEffect(() => {
    runLinter();
  }, [futureOnly, activeOnly]);

  // Apply filters
  useEffect(() => {
    let filtered = allFindings;

    // Show only overview findings
    if (showOnlyOverview) {
      filtered = filtered.filter(f => f.severity === 'overview');
    }

    // Filter by severities (if any selected)
    if (severityFilters.size > 0) {
      filtered = filtered.filter(f => severityFilters.has(f.severity));
    }

    // Filter by category
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(f => f.category === categoryFilter);
    }

    // Filter by context
    if (contextFilter !== 'all') {
      filtered = filtered.filter(f => f.context === contextFilter);
    }

    // Hide artist findings (findings with artistId but no eventId)
    if (hideArtistFindings) {
      filtered = filtered.filter(f => !f.artistId || f.eventId);
    }

    // Hide event findings (findings with eventId but no artistId or cityId)
    if (hideEventFindings) {
      filtered = filtered.filter(f => !f.eventId || f.artistId || f.cityId);
    }

    // Hide city findings (findings with cityId)
    if (hideCityFindings) {
      filtered = filtered.filter(f => !f.cityId);
    }

    // Filter by search
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      filtered = filtered.filter(f =>
        f.message.toLowerCase().includes(searchLower) ||
        f.eventEid?.toLowerCase().includes(searchLower) ||
        f.eventName?.toLowerCase().includes(searchLower) ||
        f.ruleName.toLowerCase().includes(searchLower)
      );
    }

    setFindings(filtered);
  }, [searchQuery, severityFilters, categoryFilter, contextFilter, hideArtistFindings, hideEventFindings, hideCityFindings, showOnlyOverview, allFindings]);

  // Get severity counts
  const severityCounts = useMemo(() => getSeverityCounts(allFindings), [allFindings]);

  // Get unique categories and contexts
  const categories = useMemo(() => {
    const cats = new Set(allFindings.map(f => f.category));
    return Array.from(cats).sort();
  }, [allFindings]);

  const contexts = useMemo(() => {
    const ctxs = new Set(allFindings.map(f => f.context));
    return Array.from(ctxs).sort();
  }, [allFindings]);

  // Calculate rule diagnostics
  const ruleStats = useMemo(() => {
    if (!Array.isArray(rules)) return [];

    return rules.map(rule => {
      const findingsForRule = allFindings.filter(f => f.ruleId === rule.id);
      return {
        ...rule,
        findingCount: findingsForRule.length,
        uniqueEvents: new Set(findingsForRule.map(f => f.eventId).filter(Boolean)).size,
        lastTriggered: findingsForRule.length > 0 ? 'Active' : 'No findings'
      };
    }).sort((a, b) => b.findingCount - a.findingCount); // Sort by most triggered
  }, [rules, allFindings]);

  // Handle EID click to show event details
  const handleEidClick = async (e, finding) => {
    e.stopPropagation();
    try {
      const { data: event, error } = await supabase
        .from('events')
        .select(`
          *,
          cities(id, name, country_id, countries(id, name, code))
        `)
        .eq('id', finding.eventId)
        .single();

      if (error) throw error;

      setSelectedEvent(event);
      setDialogOpen(true);
    } catch (err) {
      console.error('Error loading event:', err);
    }
  };

  // Handle EID click by event EID string (e.g., "AB3060")
  const handleEidClickByEid = async (e, eid) => {
    e.stopPropagation();
    try {
      const { data: event, error } = await supabase
        .from('events')
        .select(`
          *,
          cities(id, name, country_id, countries(id, name, code))
        `)
        .eq('eid', eid)
        .single();

      if (error) throw error;

      setSelectedEvent(event);
      setDialogOpen(true);
    } catch (err) {
      console.error('Error loading event:', err);
    }
  };

  // Render text with clickable event IDs
  const renderTextWithEventLinks = (text) => {
    if (!text) return null;

    // Pattern to match event IDs like AB3060
    const eventIdPattern = /(AB\d+)/g;
    const parts = text.split(eventIdPattern);

    return parts.map((part, index) => {
      if (part.match(eventIdPattern)) {
        return (
          <span
            key={index}
            onClick={(e) => handleEidClickByEid(e, part)}
            style={{
              textDecoration: 'underline dotted',
              cursor: 'pointer',
              color: 'var(--blue-11)',
              fontWeight: '500'
            }}
          >
            {part}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  // Handle message click to show finding details
  const handleMessageClick = (e, finding) => {
    e.stopPropagation();
    setSelectedFinding(finding);
    setFindingDialogOpen(true);
  };

  // Calculate days until/since event
  const getDaysUntilEvent = (eventDate) => {
    if (!eventDate) return null;
    const now = new Date();
    const event = new Date(eventDate);
    const diffTime = event - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Get severity color
  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'error': return 'red';
      case 'warning': return 'orange';
      case 'info': return 'blue';
      case 'success': return 'green';
      case 'overview': return 'indigo';
      default: return 'gray';
    }
  };

  // Convert country code to flag emoji
  const getFlagEmoji = (countryCode) => {
    if (!countryCode || countryCode.length !== 2) return '';
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  // Load rules from CDN
  const loadRules = async () => {
    try {
      setLoadingRules(true);
      const response = await fetch('https://artb.tor1.cdn.digitaloceanspaces.com/admin/eventLinterRules.yaml');
      const yamlText = await response.text();

      // Split by rule blocks (each starts with "\n  - id:")
      const ruleBlocks = yamlText.split(/\n\s*- id:\s*/);
      const parsedRules = [];

      // Skip first element (header/comments before first rule)
      for (let i = 1; i < ruleBlocks.length; i++) {
        const block = ruleBlocks[i];
        const lines = block.split('\n');

        // First line is the ID
        const rule = {
          id: lines[0].trim(),
          raw: '  - id: ' + block
        };

        // Parse other fields
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('name:')) {
            rule.name = trimmed.substring(5).trim().replace(/^['"]|['"]$/g, '');
          }
          if (trimmed.startsWith('severity:')) {
            rule.severity = trimmed.substring(9).trim();
          }
          if (trimmed.startsWith('category:')) {
            rule.category = trimmed.substring(9).trim();
          }
          if (trimmed.startsWith('description:')) {
            rule.description = trimmed.substring(12).trim().replace(/^['"]|['"]$/g, '');
          }
          if (trimmed.startsWith('context:')) {
            rule.context = trimmed.substring(8).trim();
          }
        }

        parsedRules.push(rule);
      }

      console.log(`Parsed ${parsedRules.length} rules from YAML`);
      setRules(parsedRules);
    } catch (err) {
      console.error('Error loading rules:', err);
    } finally {
      setLoadingRules(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'rules' && rules.length === 0) {
      loadRules();
    }
  }, [activeTab]);

  // Test a specific rule
  const testRule = async (ruleId) => {
    try {
      setTestingRule(true);
      setRuleTestResults(null);

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || 'https://xsqdkubgyqwpyvfltnrf.supabase.co'}/functions/v1/test-linter-rule`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ruleId })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setRuleTestResults(result);
    } catch (err) {
      console.error('Error testing rule:', err);
      setRuleTestResults({
        error: 'Failed to test rule. Please try again.',
        details: err.message
      });
    } finally {
      setTestingRule(false);
    }
  };

  // AI Analysis function
  const runAIAnalysis = async () => {
    try {
      setAnalyzingAI(true);
      setAiAnalysis(null);
      setAiAnalysisTime(0);

      // Start timer
      const startTime = Date.now();
      aiTimerRef.current = setInterval(() => {
        setAiAnalysisTime(Math.floor((Date.now() - startTime) / 1000));
      }, 100);

      // Prepare summary of current filtered findings
      const summary = {
        total: findings.length,
        severityCounts,
        categories: Array.from(new Set(findings.map(f => f.category))),
        contexts: Array.from(new Set(findings.map(f => f.context))),
        allFindings: findings.map(f => ({
          severity: f.severity,
          category: f.category,
          message: f.message,
          eventEid: f.eventEid,
          eventName: f.eventName,
          ruleId: f.ruleId,
          ruleName: f.ruleName,
          context: f.context
        })),
        filters: {
          search: searchQuery,
          severities: Array.from(severityFilters),
          category: categoryFilter,
          context: contextFilter,
          futureOnly,
          activeOnly
        }
      };

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || 'https://xsqdkubgyqwpyvfltnrf.supabase.co'}/functions/v1/event-linter-ai-analysis`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ findings: summary })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (aiTimerRef.current) clearInterval(aiTimerRef.current);
      setAiAnalysis(result.analysis);
      setShowAIAnalysis(true);
    } catch (err) {
      console.error('Error running AI analysis:', err);
      if (aiTimerRef.current) clearInterval(aiTimerRef.current);
      setAiAnalysis({
        error: 'Failed to generate AI analysis. Please try again.',
        details: err.message
      });
      setShowAIAnalysis(true);
    } finally {
      setAnalyzingAI(false);
    }
  };

  return (
    <Box p="3">
      <Flex direction="column" gap="3">
        {/* Header */}
        <Flex justify="between" align="center">
          <Box>
            <Heading size="5">Event Linter</Heading>
            <Text size="1" color="gray">
              Automated event health checks and operational warnings
            </Text>
          </Box>
          <Flex gap="2">
            <Button size="1" onClick={runAIAnalysis} disabled={analyzingAI || loading || findings.length === 0} variant="soft">
              {analyzingAI ? <ReloadIcon className="animate-spin" /> : '🤖'}
              {analyzingAI ? 'Analyzing...' : 'AI Analyze'}
            </Button>
            <Button size="1" onClick={runLinter} disabled={loading}>
              <ReloadIcon />
              Refresh
            </Button>
          </Flex>
        </Flex>

        {/* Tabs */}
        <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Trigger value="findings">
              Findings ({allFindings.length})
            </Tabs.Trigger>
            <Tabs.Trigger value="rules">
              Rules ({Array.isArray(rules) ? rules.length : rules.length || 0})
            </Tabs.Trigger>
          </Tabs.List>

          <Box pt="3">
            <Tabs.Content value="findings">
              <Flex direction="column" gap="3">
                {/* AI Analysis Section */}
                {analyzingAI && (
          <Card style={{ backgroundColor: 'var(--indigo-2)', borderColor: 'var(--indigo-6)' }}>
            <Box p="4">
              <Flex justify="center" align="center" direction="column" gap="3">
                <Flex align="center" gap="2">
                  <div style={{ animation: 'spin 1s linear infinite' }}>
                    <ReloadIcon width="20" height="20" style={{ color: 'var(--indigo-9)' }} />
                  </div>
                  <Text size="4" weight="bold">Analyzing with AI...</Text>
                </Flex>
                <Badge color="indigo" size="2" variant="soft">
                  {aiAnalysisTime}s
                </Badge>
                <Text size="1" color="gray">
                  Generating insights for {findings.length} findings
                </Text>
              </Flex>
            </Box>
          </Card>
        )}
        {showAIAnalysis && aiAnalysis && !analyzingAI && (
          <Card style={{ backgroundColor: 'var(--indigo-2)', borderColor: 'var(--indigo-6)' }}>
            <Box p="4">
              <Flex justify="between" align="start" mb="3">
                <Flex align="center" gap="2">
                  <Text size="4" weight="bold">🤖 AI Analysis</Text>
                  <Badge color="indigo" size="1">Beta</Badge>
                </Flex>
                <Button size="1" variant="ghost" onClick={() => setShowAIAnalysis(false)}>
                  <CrossCircledIcon />
                </Button>
              </Flex>

              {aiAnalysis.error ? (
                <Card style={{ backgroundColor: 'var(--red-2)', borderColor: 'var(--red-6)' }}>
                  <Box p="3">
                    <Text size="2" weight="medium" color="red">{aiAnalysis.error}</Text>
                    {aiAnalysis.details && (
                      <Text size="1" color="gray" mt="1" style={{ display: 'block' }}>
                        {aiAnalysis.details}
                      </Text>
                    )}
                  </Box>
                </Card>
              ) : (
                <Flex direction="column" gap="3">
                  {aiAnalysis.overview && (
                    <Box>
                      <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>Overview</Text>
                      <Text size="2" style={{ lineHeight: '1.6' }}>{renderTextWithEventLinks(aiAnalysis.overview)}</Text>
                    </Box>
                  )}

                  {aiAnalysis.key_issues && aiAnalysis.key_issues.length > 0 && (
                    <Box>
                      <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>Key Issues</Text>
                      <Flex direction="column" gap="1">
                        {aiAnalysis.key_issues.map((issue, idx) => (
                          <Text key={idx} size="2" style={{ paddingLeft: '12px', position: 'relative' }}>
                            <span style={{ position: 'absolute', left: 0 }}>•</span> {renderTextWithEventLinks(issue)}
                          </Text>
                        ))}
                      </Flex>
                    </Box>
                  )}

                  {aiAnalysis.recommendations && aiAnalysis.recommendations.length > 0 && (
                    <Box>
                      <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>Recommendations</Text>
                      <Flex direction="column" gap="1">
                        {aiAnalysis.recommendations.map((rec, idx) => (
                          <Text key={idx} size="2" style={{ paddingLeft: '12px', position: 'relative' }}>
                            <span style={{ position: 'absolute', left: 0 }}>→</span> {renderTextWithEventLinks(rec)}
                          </Text>
                        ))}
                      </Flex>
                    </Box>
                  )}

                  {aiAnalysis.priority_actions && aiAnalysis.priority_actions.length > 0 && (
                    <Card style={{ backgroundColor: 'var(--amber-2)', borderColor: 'var(--amber-6)' }}>
                      <Box p="3">
                        <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>Priority Actions</Text>
                        <Flex direction="column" gap="1">
                          {aiAnalysis.priority_actions.map((action, idx) => (
                            <Text key={idx} size="2" weight="medium" style={{ paddingLeft: '12px', position: 'relative' }}>
                              <span style={{ position: 'absolute', left: 0 }}>⚡</span> {renderTextWithEventLinks(action)}
                            </Text>
                          ))}
                        </Flex>
                      </Box>
                    </Card>
                  )}

                  <Separator />

                  <Flex justify="between" align="center">
                    <Text size="1" color="gray">
                      Analysis based on {findings.length} findings
                    </Text>
                    <Button size="1" variant="soft" onClick={runAIAnalysis} disabled={analyzingAI}>
                      <ReloadIcon />
                      Regenerate
                    </Button>
                  </Flex>
                </Flex>
              )}
            </Box>
          </Card>
        )}

        {/* Summary Stats - Clickable Filters */}
        <Card size="1">
          <Flex gap="2" align="center" wrap="wrap">
            <Text size="1" weight="medium">Filters:</Text>

            <Badge
              color="red"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={severityFilters.has('error') ? 'solid' : 'soft'}
              onClick={() => {
                const newFilters = new Set(severityFilters);
                if (newFilters.has('error')) {
                  newFilters.delete('error');
                } else {
                  newFilters.add('error');
                }
                setSeverityFilters(newFilters);
              }}
            >
              ❌ {severityCounts.error} Errors
            </Badge>

            <Badge
              color="orange"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={severityFilters.has('warning') ? 'solid' : 'soft'}
              onClick={() => {
                const newFilters = new Set(severityFilters);
                if (newFilters.has('warning')) {
                  newFilters.delete('warning');
                } else {
                  newFilters.add('warning');
                }
                setSeverityFilters(newFilters);
              }}
            >
              ⚠️ {severityCounts.warning} Warnings
            </Badge>

            <Badge
              color="amber"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={severityFilters.has('reminder') ? 'solid' : 'soft'}
              onClick={() => {
                const newFilters = new Set(severityFilters);
                if (newFilters.has('reminder')) {
                  newFilters.delete('reminder');
                } else {
                  newFilters.add('reminder');
                }
                setSeverityFilters(newFilters);
              }}
            >
              🔔 {severityCounts.reminder} Reminders
            </Badge>

            <Badge
              color="blue"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={severityFilters.has('info') ? 'solid' : 'soft'}
              onClick={() => {
                const newFilters = new Set(severityFilters);
                if (newFilters.has('info')) {
                  newFilters.delete('info');
                } else {
                  newFilters.add('info');
                }
                setSeverityFilters(newFilters);
              }}
            >
              📊 {severityCounts.info} Info
            </Badge>

            <Badge
              color="green"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={severityFilters.has('success') ? 'solid' : 'soft'}
              onClick={() => {
                const newFilters = new Set(severityFilters);
                if (newFilters.has('success')) {
                  newFilters.delete('success');
                } else {
                  newFilters.add('success');
                }
                setSeverityFilters(newFilters);
              }}
            >
              ✅ {severityCounts.success} Success
            </Badge>

            <Badge
              color="indigo"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={severityFilters.has('overview') ? 'solid' : 'soft'}
              onClick={() => {
                const newFilters = new Set(severityFilters);
                if (newFilters.has('overview')) {
                  newFilters.delete('overview');
                } else {
                  newFilters.add('overview');
                }
                setSeverityFilters(newFilters);
              }}
            >
              📊 {severityCounts.overview || 0} Overview
            </Badge>

            <Badge
              color="purple"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={futureOnly ? 'solid' : 'soft'}
              onClick={() => setFutureOnly(!futureOnly)}
            >
              🔮 Future
            </Badge>

            <Badge
              color="cyan"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={activeOnly ? 'solid' : 'soft'}
              onClick={() => setActiveOnly(!activeOnly)}
            >
              ⚡ Active (±24h)
            </Badge>

            <Badge
              color="gray"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={hideEventFindings ? 'solid' : 'soft'}
              onClick={() => setHideEventFindings(!hideEventFindings)}
            >
              📅 Hide Events
            </Badge>

            <Badge
              color="gray"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={hideArtistFindings ? 'solid' : 'soft'}
              onClick={() => setHideArtistFindings(!hideArtistFindings)}
            >
              👤 Hide Artists
            </Badge>

            <Badge
              color="gray"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={hideCityFindings ? 'solid' : 'soft'}
              onClick={() => setHideCityFindings(!hideCityFindings)}
            >
              🏙️ Hide Cities
            </Badge>

            <Badge
              color="indigo"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={showOnlyOverview ? 'solid' : 'soft'}
              onClick={() => setShowOnlyOverview(!showOnlyOverview)}
            >
              📊 Overview Only
            </Badge>

            <Text size="1" color="gray">
              ({allFindings.length} total)
            </Text>
          </Flex>
        </Card>

        {/* Filters */}
        <Card size="1">
          <Flex gap="2" wrap="wrap" align="end">
            <Box style={{ flex: '1 1 300px', minWidth: '200px' }}>
              <TextField.Root
                size="1"
                placeholder="Search by EID, event name, message..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              >
                <TextField.Slot>
                  <MagnifyingGlassIcon height="14" width="14" />
                </TextField.Slot>
              </TextField.Root>
            </Box>

            <Box style={{ flex: '0 1 120px', minWidth: '100px' }}>
              <Select.Root value={categoryFilter} onValueChange={setCategoryFilter}>
                <Select.Trigger size="1" style={{ width: '100%' }} />
                <Select.Content>
                  <Select.Item value="all">All Categories</Select.Item>
                  {categories.map(cat => (
                    <Select.Item key={cat} value={cat}>
                      {cat.replace(/_/g, ' ')}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>

            <Box style={{ flex: '0 1 120px', minWidth: '100px' }}>
              <Select.Root value={contextFilter} onValueChange={setContextFilter}>
                <Select.Trigger size="1" style={{ width: '100%' }} />
                <Select.Content>
                  <Select.Item value="all">All Contexts</Select.Item>
                  {contexts.map(ctx => (
                    <Select.Item key={ctx} value={ctx}>
                      {ctx.replace(/_/g, ' ')}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>

            {(searchQuery || severityFilters.size > 0 || categoryFilter !== 'all' || contextFilter !== 'all' || futureOnly || activeOnly || hideEventFindings || hideArtistFindings || hideCityFindings || showOnlyOverview) && (
              <Button
                size="1"
                variant="ghost"
                color="gray"
                onClick={() => {
                  setSearchQuery('');
                  setSeverityFilters(new Set());
                  setCategoryFilter('all');
                  setContextFilter('all');
                  setFutureOnly(false);
                  setActiveOnly(false);
                  setHideEventFindings(false);
                  setHideArtistFindings(false);
                  setHideCityFindings(false);
                  setShowOnlyOverview(false);
                }}
              >
                <CrossCircledIcon />
                Clear
              </Button>
            )}
          </Flex>
        </Card>

        {/* Stats Info */}
        <Flex align="center" gap="2">
          <Text size="1" color="gray">
            {rules.length ? `${rules.length} rules` : 'Loading rules...'} • {findings.length} findings
          </Text>
          {loading && (
            <div style={{ animation: 'spin 1s linear infinite' }}>
              <ReloadIcon width="14" height="14" style={{ color: 'var(--blue-9)' }} />
            </div>
          )}
        </Flex>

        {/* Console-like Results Table */}
        <Card style={{
          backgroundColor: 'var(--color-panel-solid)',
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'
        }}>
          {loading && findings.length === 0 ? (
            <Flex align="center" justify="center" p="6">
              <Spinner size="3" />
            </Flex>
          ) : findings.length === 0 ? (
            <Flex align="center" justify="center" p="6" direction="column" gap="2">
              <InfoCircledIcon width="24" height="24" color="var(--gray-9)" />
              <Text color="gray">No findings match the current filters</Text>
            </Flex>
          ) : (
            <Table.Root variant="surface" size="1">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell style={{ width: '30px', padding: '4px 8px' }}></Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ width: '80px', padding: '4px 8px' }}>EID</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ width: '180px', padding: '4px 8px' }}>Event</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ width: '90px', padding: '4px 8px' }}>Severity</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ minWidth: '300px', padding: '4px 8px' }}>Message</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ width: '120px', padding: '4px 8px' }}>Category</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>

              <Table.Body>
                {findings.map((finding, index) => (
                  <Table.Row
                    key={`${finding.eventId}-${finding.ruleId}-${index}`}
                  >
                    <Table.Cell style={{ padding: '4px 8px' }}>
                      <Text size="2">{finding.emoji}</Text>
                    </Table.Cell>
                    <Table.Cell
                      style={{ padding: '4px 8px', cursor: finding.eventEid ? 'pointer' : 'default' }}
                      onClick={(e) => finding.eventEid && handleEidClick(e, finding)}
                    >
                      {finding.eventEid ? (
                        <Badge color={finding.artistNumber ? 'purple' : finding.cityId ? 'blue' : 'gray'} variant="soft" size="1">
                          {finding.cityId ? getFlagEmoji(finding.countryCode) : (finding.eventEid || (finding.artistNumber ? `#${finding.artistNumber}` : 'N/A'))}
                        </Badge>
                      ) : (
                        <Text size="1" color="gray">-</Text>
                      )}
                    </Table.Cell>
                    <Table.Cell style={{ padding: '4px 8px' }}>
                      <Text size="1" weight="medium" style={{
                        maxWidth: '180px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'block'
                      }}>
                        {finding.cityId ? finding.cityName : finding.eventName}
                      </Text>
                    </Table.Cell>
                    <Table.Cell style={{ padding: '4px 8px' }}>
                      <Badge color={getSeverityColor(finding.severity)} variant="soft" size="1">
                        {finding.severity}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell
                      style={{ padding: '4px 8px', cursor: 'pointer' }}
                      onClick={(e) => handleMessageClick(e, finding)}
                    >
                      <Text size="1" style={{ fontFamily: 'inherit' }}>
                        {finding.message}
                      </Text>
                    </Table.Cell>
                    <Table.Cell style={{ padding: '4px 8px' }}>
                      <Text size="1" color="gray" style={{
                        textTransform: 'capitalize',
                        fontFamily: 'inherit'
                      }}>
                        {finding.category.replace(/_/g, ' ')}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          )}
        </Card>
              </Flex>
            </Tabs.Content>

            {/* Rules Tab */}
            <Tabs.Content value="rules">
              <Flex direction="column" gap="3">
                {loadingRules ? (
                  <Flex align="center" justify="center" p="6">
                    <Spinner size="3" />
                  </Flex>
                ) : ruleStats.length === 0 ? (
                  <Card>
                    <Flex align="center" justify="center" p="6" direction="column" gap="2">
                      <InfoCircledIcon width="24" height="24" color="var(--gray-9)" />
                      <Text color="gray">No rules loaded</Text>
                      <Button size="2" onClick={loadRules}>
                        <ReloadIcon />
                        Load Rules
                      </Button>
                    </Flex>
                  </Card>
                ) : (
                  <>
                    {/* Rules Summary */}
                    <Card>
                      <Flex gap="4" wrap="wrap">
                        <Box>
                          <Text size="1" color="gray">Total Rules</Text>
                          <Text size="5" weight="bold">{ruleStats.length}</Text>
                        </Box>
                        <Box>
                          <Text size="1" color="gray">Active Rules</Text>
                          <Text size="5" weight="bold">{ruleStats.filter(r => r.findingCount > 0).length}</Text>
                        </Box>
                        <Box>
                          <Text size="1" color="gray">Inactive Rules</Text>
                          <Text size="5" weight="bold">{ruleStats.filter(r => r.findingCount === 0).length}</Text>
                        </Box>
                        <Box>
                          <Text size="1" color="gray">Total Findings</Text>
                          <Text size="5" weight="bold">{allFindings.length}</Text>
                        </Box>
                      </Flex>
                    </Card>

                    {/* Rules Table */}
                    <Card>
                      <Table.Root variant="surface" size="1">
                        <Table.Header>
                          <Table.Row>
                            <Table.ColumnHeaderCell>Rule ID</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Severity</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Category</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Findings</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Events</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {ruleStats.map((rule) => (
                            <Table.Row
                              key={rule.id}
                              style={{ cursor: 'pointer' }}
                              onClick={() => {
                                setSelectedRule(rule);
                                setRuleDialogOpen(true);
                              }}
                            >
                              <Table.Cell>
                                <Code size="1">{rule.id}</Code>
                              </Table.Cell>
                              <Table.Cell>
                                <Text size="2" weight="medium">{rule.name || 'Unnamed'}</Text>
                              </Table.Cell>
                              <Table.Cell>
                                <Badge color={getSeverityColor(rule.severity)} size="1">
                                  {rule.severity || 'unknown'}
                                </Badge>
                              </Table.Cell>
                              <Table.Cell>
                                <Text size="1" style={{ textTransform: 'capitalize' }}>
                                  {rule.category?.replace(/_/g, ' ') || 'N/A'}
                                </Text>
                              </Table.Cell>
                              <Table.Cell>
                                <Badge color={rule.findingCount > 0 ? 'blue' : 'gray'} variant="soft">
                                  {rule.findingCount}
                                </Badge>
                              </Table.Cell>
                              <Table.Cell>
                                <Text size="1" color="gray">{rule.uniqueEvents}</Text>
                              </Table.Cell>
                              <Table.Cell>
                                {rule.findingCount > 0 ? (
                                  <Badge color="green" size="1">Active</Badge>
                                ) : (
                                  <Badge color="gray" size="1" variant="outline">Inactive</Badge>
                                )}
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Root>
                    </Card>
                  </>
                )}
              </Flex>
            </Tabs.Content>
          </Box>
        </Tabs.Root>
      </Flex>

      {/* Rule Details Modal */}
      <Dialog.Root open={ruleDialogOpen} onOpenChange={(open) => {
        setRuleDialogOpen(open);
        if (!open) {
          setRuleTestResults(null);
          setTestingRule(false);
        }
      }}>
        <Dialog.Content style={{ maxWidth: 700 }}>
          <Dialog.Title>Rule Details</Dialog.Title>
          <Dialog.Description size="1" mb="4">
            Comprehensive information about this linter rule
          </Dialog.Description>

          {selectedRule && (
            <Flex direction="column" gap="3">
              {/* Rule Header */}
              <Card>
                <Flex direction="column" gap="2">
                  <Flex justify="between" align="center">
                    <Code size="2">{selectedRule.id}</Code>
                    <Badge color={getSeverityColor(selectedRule.severity)} size="2">
                      {selectedRule.severity}
                    </Badge>
                  </Flex>
                  <Text size="3" weight="bold">{selectedRule.name}</Text>
                  {selectedRule.description && (
                    <Text size="2" color="gray">{selectedRule.description}</Text>
                  )}
                </Flex>
              </Card>

              {/* Rule Statistics */}
              <Card>
                <Flex direction="column" gap="2">
                  <Text size="1" weight="bold" color="gray">Statistics</Text>
                  <Flex gap="4" wrap="wrap">
                    <Box>
                      <Text size="1" color="gray">Total Findings</Text>
                      <Text size="3" weight="bold">{selectedRule.findingCount || 0}</Text>
                    </Box>
                    <Box>
                      <Text size="1" color="gray">Affected Events</Text>
                      <Text size="3" weight="bold">{selectedRule.uniqueEvents || 0}</Text>
                    </Box>
                    <Box>
                      <Text size="1" color="gray">Category</Text>
                      <Text size="2" style={{ textTransform: 'capitalize' }}>
                        {selectedRule.category?.replace(/_/g, ' ') || 'N/A'}
                      </Text>
                    </Box>
                  </Flex>
                </Flex>
              </Card>

              {/* Rule Definition (YAML) */}
              {selectedRule.raw && (
                <Card>
                  <Flex direction="column" gap="2">
                    <Text size="1" weight="bold" color="gray">YAML Definition</Text>
                    <Box
                      style={{
                        backgroundColor: 'var(--gray-2)',
                        borderRadius: '4px',
                        padding: '12px',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        overflow: 'auto',
                        maxHeight: '300px'
                      }}
                    >
                      <pre>{selectedRule.raw}</pre>
                    </Box>
                  </Flex>
                </Card>
              )}

              {/* Edit Placeholder */}
              <Card style={{ backgroundColor: 'var(--gray-2)', borderColor: 'var(--gray-6)' }}>
                <Flex align="center" gap="2" p="2">
                  <InfoCircledIcon />
                  <Text size="1" color="gray">
                    Rule editing feature coming soon
                  </Text>
                </Flex>
              </Card>

              {/* Rule Diagnostics - Test Button */}
              {selectedRule.findingCount === 0 && (
                <Card style={{ backgroundColor: 'var(--blue-2)', borderColor: 'var(--blue-6)' }}>
                  <Flex direction="column" gap="3" p="2">
                    <Flex align="center" justify="between">
                      <Text size="2" weight="bold">Diagnostic Testing</Text>
                      <Badge color="blue" size="1">Beta</Badge>
                    </Flex>
                    <Text size="1" color="gray">
                      This rule has no findings. Run diagnostic tests to understand why it's not triggering.
                    </Text>
                    <Button
                      size="2"
                      onClick={() => testRule(selectedRule.id)}
                      disabled={testingRule}
                      variant="soft"
                    >
                      {testingRule ? (
                        <>
                          <ReloadIcon className="animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>Test Rule</>
                      )}
                    </Button>
                  </Flex>
                </Card>
              )}

              {/* Rule Test Results */}
              {ruleTestResults && (
                <Card style={{ backgroundColor: 'var(--violet-2)', borderColor: 'var(--violet-6)' }}>
                  <Flex direction="column" gap="3" p="3">
                    <Flex justify="between" align="center">
                      <Text size="2" weight="bold">Test Results</Text>
                      <Button
                        size="1"
                        variant="ghost"
                        onClick={() => setRuleTestResults(null)}
                      >
                        <CrossCircledIcon />
                      </Button>
                    </Flex>

                    {ruleTestResults.error ? (
                      <Card style={{ backgroundColor: 'var(--red-2)', borderColor: 'var(--red-6)' }}>
                        <Box p="2">
                          <Text size="2" weight="medium" color="red">{ruleTestResults.error}</Text>
                          {ruleTestResults.details && (
                            <Text size="1" color="gray" mt="1" style={{ display: 'block' }}>
                              {ruleTestResults.details}
                            </Text>
                          )}
                        </Box>
                      </Card>
                    ) : (
                      <Flex direction="column" gap="3">
                        {/* Summary Stats */}
                        <Card>
                          <Flex gap="4" wrap="wrap" p="2">
                            <Box>
                              <Text size="1" color="gray">Events Checked</Text>
                              <Text size="3" weight="bold">{ruleTestResults.diagnostics?.totalEventsChecked || 0}</Text>
                            </Box>
                            <Box>
                              <Text size="1" color="gray">Matching Events</Text>
                              <Text size="3" weight="bold" color={ruleTestResults.diagnostics?.matchingEvents > 0 ? 'blue' : 'gray'}>
                                {ruleTestResults.diagnostics?.matchingEvents || 0}
                              </Text>
                            </Box>
                            <Box>
                              <Text size="1" color="gray">Almost Matching</Text>
                              <Text size="3" weight="bold">{ruleTestResults.diagnostics?.almostMatchingEvents?.length || 0}</Text>
                            </Box>
                          </Flex>
                        </Card>

                        {/* Recommendations */}
                        {ruleTestResults.recommendations && ruleTestResults.recommendations.length > 0 && (
                          <Card style={{ backgroundColor: 'var(--amber-2)', borderColor: 'var(--amber-6)' }}>
                            <Box p="2">
                              <Text size="1" weight="bold" mb="2" style={{ display: 'block' }}>Recommendations</Text>
                              <Flex direction="column" gap="1">
                                {ruleTestResults.recommendations.map((rec, idx) => (
                                  <Text key={idx} size="1" style={{ paddingLeft: '12px', position: 'relative' }}>
                                    <span style={{ position: 'absolute', left: 0 }}>•</span> {rec}
                                  </Text>
                                ))}
                              </Flex>
                            </Box>
                          </Card>
                        )}

                        {/* Field Presence */}
                        {ruleTestResults.diagnostics?.fieldPresence && Object.keys(ruleTestResults.diagnostics.fieldPresence).length > 0 && (
                          <Card>
                            <Box p="2">
                              <Text size="1" weight="bold" mb="2" style={{ display: 'block' }}>Field Presence in Database</Text>
                              <Flex direction="column" gap="2">
                                {Object.entries(ruleTestResults.diagnostics.fieldPresence).map(([field, stats]) => (
                                  <Flex key={field} justify="between" align="center">
                                    <Text size="1" style={{ fontFamily: 'monospace' }}>{field}</Text>
                                    <Flex gap="2" align="center">
                                      <Badge color="green" size="1" variant="soft">
                                        {stats.present} present
                                      </Badge>
                                      <Badge color="gray" size="1" variant="soft">
                                        {stats.missing} missing
                                      </Badge>
                                    </Flex>
                                  </Flex>
                                ))}
                              </Flex>
                            </Box>
                          </Card>
                        )}

                        {/* Almost Matching Events */}
                        {ruleTestResults.diagnostics?.almostMatchingEvents && ruleTestResults.diagnostics.almostMatchingEvents.length > 0 && (
                          <Card>
                            <Box p="2">
                              <Text size="1" weight="bold" mb="2" style={{ display: 'block' }}>Almost Matching Events</Text>
                              <Text size="1" color="gray" mb="2" style={{ display: 'block' }}>
                                These events failed by one condition:
                              </Text>
                              <Flex direction="column" gap="2">
                                {ruleTestResults.diagnostics.almostMatchingEvents.map((event, idx) => (
                                  <Box key={idx}>
                                    <Flex align="center" gap="2" mb="1">
                                      <Badge color="gray" size="1">{event.eid}</Badge>
                                      <Text size="1">{event.name}</Text>
                                    </Flex>
                                    <Box style={{ paddingLeft: '12px', fontSize: '11px', fontFamily: 'monospace' }}>
                                      {Object.entries(event.conditionResults).map(([field, result]) => (
                                        <div key={field}>
                                          <Badge color={result.met ? 'green' : 'red'} size="1" variant="soft">
                                            {result.met ? '✓' : '✗'}
                                          </Badge>{' '}
                                          {field}: {JSON.stringify(result.fieldValue)} {result.operator} {JSON.stringify(result.value)}
                                        </div>
                                      ))}
                                    </Box>
                                  </Box>
                                ))}
                              </Flex>
                            </Box>
                          </Card>
                        )}

                        {/* Rule Conditions */}
                        {ruleTestResults.rule?.conditions && ruleTestResults.rule.conditions.length > 0 && (
                          <details>
                            <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--gray-10)' }}>
                              Show Rule Conditions ({ruleTestResults.rule.conditions.length})
                            </summary>
                            <Box mt="2" p="2" style={{
                              backgroundColor: 'var(--gray-2)',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontFamily: 'monospace'
                            }}>
                              {ruleTestResults.rule.conditions.map((condition, idx) => (
                                <div key={idx}>
                                  {condition.field} {condition.operator} {JSON.stringify(condition.value)}
                                </div>
                              ))}
                            </Box>
                          </details>
                        )}
                      </Flex>
                    )}
                  </Flex>
                </Card>
              )}
            </Flex>
          )}

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Close
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Event Details Modal */}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Content style={{ maxWidth: 500 }}>
          <Dialog.Title>Event Details</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Basic information about this event
          </Dialog.Description>

          {selectedEvent && (
            <Flex direction="column" gap="3">
              <Box>
                <Text size="2" weight="medium" color="gray">Event ID</Text>
                <Text size="3">{selectedEvent.eid || 'N/A'}</Text>
              </Box>

              <Separator size="4" />

              <Box>
                <Text size="2" weight="medium" color="gray">Name</Text>
                <Text size="3">{selectedEvent.name}</Text>
              </Box>

              <Box>
                <Text size="2" weight="medium" color="gray">City</Text>
                <Text size="3">
                  {selectedEvent.cities?.name || 'Not set'}
                  {selectedEvent.cities?.countries?.name && `, ${selectedEvent.cities.countries.name}`}
                </Text>
              </Box>

              <Box>
                <Text size="2" weight="medium" color="gray">Date</Text>
                <Flex align="center" gap="2">
                  <CalendarIcon />
                  <Text size="3">
                    {selectedEvent.event_start_datetime
                      ? formatDateForDisplay(selectedEvent.event_start_datetime).fullDate
                      : 'Not set'
                    }
                  </Text>
                </Flex>
              </Box>

              <Box>
                <Text size="2" weight="medium" color="gray">Status</Text>
                {selectedEvent.event_start_datetime && (() => {
                  const daysUntil = getDaysUntilEvent(selectedEvent.event_start_datetime);
                  if (daysUntil > 0) {
                    return (
                      <Badge color="blue" size="2">
                        {daysUntil} day{daysUntil !== 1 ? 's' : ''} until event
                      </Badge>
                    );
                  } else if (daysUntil === 0) {
                    return (
                      <Badge color="green" size="2">
                        Event today!
                      </Badge>
                    );
                  } else {
                    return (
                      <Badge color="gray" size="2">
                        {Math.abs(daysUntil)} day{Math.abs(daysUntil) !== 1 ? 's' : ''} ago
                      </Badge>
                    );
                  }
                })()}
              </Box>

              <Separator size="4" />

              <Button
                variant="soft"
                onClick={() => window.open(`/admin/events/${selectedEvent.id}`, '_blank')}
              >
                View Full Event Details
              </Button>
            </Flex>
          )}

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Close
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Finding Details Modal */}
      <Dialog.Root open={findingDialogOpen} onOpenChange={setFindingDialogOpen}>
        <Dialog.Content style={{ maxWidth: 600 }}>
          <Dialog.Title>Finding Details</Dialog.Title>
          <Dialog.Description size="1" mb="4">
            Complete information about this linter finding
          </Dialog.Description>

          {selectedFinding && (
            <Flex direction="column" gap="3">
              {/* Rule Information */}
              <Card>
                <Flex direction="column" gap="2">
                  <Flex justify="between" align="center">
                    <Text size="1" weight="bold" color="gray">Rule</Text>
                    <Badge color={getSeverityColor(selectedFinding.severity)} size="1">
                      {selectedFinding.severity}
                    </Badge>
                  </Flex>
                  <Text size="2" weight="medium">{selectedFinding.ruleName}</Text>
                  <Text size="1" color="gray">Rule ID: {selectedFinding.ruleId}</Text>
                </Flex>
              </Card>

              {/* Event or Artist Information */}
              {selectedFinding.artistId ? (
                <Card>
                  <Flex direction="column" gap="3">
                    <Text size="1" weight="bold" color="gray">Artist</Text>
                    <Flex align="center" gap="2">
                      <Badge color="purple" variant="soft" size="1">
                        #{selectedFinding.artistNumber}
                      </Badge>
                      <Text size="2" weight="medium">{selectedFinding.artistName}</Text>
                    </Flex>
                    <Flex gap="2">
                      <Button
                        size="2"
                        variant="soft"
                        onClick={() => window.open(`/artists/${selectedFinding.artistId}`, '_blank')}
                      >
                        View Profile
                      </Button>
                      <Button
                        size="2"
                        variant="soft"
                        onClick={() => window.open(`/artist-payments/${selectedFinding.artistId}`, '_blank')}
                      >
                        Payment Account
                      </Button>
                    </Flex>
                    {selectedFinding.artistId && (
                      <Text size="1" color="gray" style={{ fontFamily: 'monospace' }}>
                        ID: {selectedFinding.artistId}
                      </Text>
                    )}
                  </Flex>
                </Card>
              ) : (
                <Card>
                  <Flex direction="column" gap="2">
                    <Text size="1" weight="bold" color="gray">Event</Text>
                    <Flex align="center" gap="2">
                      <Badge color="gray" variant="soft" size="1">
                        {selectedFinding.eventEid || 'N/A'}
                      </Badge>
                      <Text size="2">{selectedFinding.eventName}</Text>
                    </Flex>
                    {selectedFinding.eventId && (
                      <Text size="1" color="gray" style={{ fontFamily: 'monospace' }}>
                        ID: {selectedFinding.eventId}
                      </Text>
                    )}
                  </Flex>
                </Card>
              )}

              {/* Message */}
              <Card>
                <Flex direction="column" gap="2">
                  <Text size="1" weight="bold" color="gray">Message</Text>
                  <Text size="2" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                    {selectedFinding.emoji} {selectedFinding.message}
                  </Text>
                </Flex>
              </Card>

              {/* Metadata */}
              <Card>
                <Flex direction="column" gap="2">
                  <Text size="1" weight="bold" color="gray">Metadata</Text>
                  <Flex gap="4" wrap="wrap">
                    <Box>
                      <Text size="1" color="gray">Category</Text>
                      <Text size="2" style={{ textTransform: 'capitalize' }}>
                        {selectedFinding.category.replace(/_/g, ' ')}
                      </Text>
                    </Box>
                    <Box>
                      <Text size="1" color="gray">Context</Text>
                      <Text size="2" style={{ textTransform: 'capitalize' }}>
                        {selectedFinding.context.replace(/_/g, ' ')}
                      </Text>
                    </Box>
                    {selectedFinding.timestamp && (
                      <Box>
                        <Text size="1" color="gray">Detected</Text>
                        <Text size="2">
                          {new Date(selectedFinding.timestamp).toLocaleString()}
                        </Text>
                      </Box>
                    )}
                  </Flex>
                </Flex>
              </Card>

              {/* Artist Payment Info if available */}
              {selectedFinding.artistName && (
                <Card>
                  <Flex direction="column" gap="2">
                    <Text size="1" weight="bold" color="gray">Artist Payment Details</Text>
                    <Flex gap="4" wrap="wrap">
                      <Box>
                        <Text size="1" color="gray">Artist</Text>
                        <Text size="2">{selectedFinding.artistName}</Text>
                      </Box>
                      {selectedFinding.balanceOwed && (
                        <Box>
                          <Text size="1" color="gray">Amount Owed</Text>
                          <Text size="2">
                            {selectedFinding.currency} ${selectedFinding.balanceOwed.toFixed(2)}
                          </Text>
                        </Box>
                      )}
                      {selectedFinding.daysOverdue && (
                        <Box>
                          <Text size="1" color="gray">Days Overdue</Text>
                          <Badge color="red" size="1">
                            {selectedFinding.daysOverdue} days
                          </Badge>
                        </Box>
                      )}
                    </Flex>
                    {selectedFinding.artistEmail && (
                      <Box>
                        <Text size="1" color="gray">Email</Text>
                        <Text size="2" style={{ fontFamily: 'monospace' }}>
                          {selectedFinding.artistEmail}
                        </Text>
                      </Box>
                    )}
                  </Flex>
                </Card>
              )}

              {/* Suppress Finding */}
              <Card style={{ backgroundColor: 'var(--amber-2)', borderColor: 'var(--amber-6)' }}>
                <Flex direction="column" gap="3">
                  <Flex align="center" gap="2">
                    <Text size="2" weight="bold">Suppress This Finding</Text>
                    <Badge color="orange" size="1">Hide from future results</Badge>
                  </Flex>

                  <Text size="1" color="gray">
                    Suppress this specific finding for this {selectedFinding.eventId ? 'event' : 'artist'}.
                    It will no longer appear in linter results.
                  </Text>

                  <Flex direction="column" gap="2">
                    <label>
                      <Text size="1" weight="medium" mb="1" style={{ display: 'block' }}>Duration</Text>
                      <Select.Root value={suppressDuration} onValueChange={setSuppressDuration}>
                        <Select.Trigger style={{ width: '200px' }} />
                        <Select.Content>
                          <Select.Item value="forever">Forever</Select.Item>
                          <Select.Item value="7">7 days</Select.Item>
                          <Select.Item value="30">30 days</Select.Item>
                          <Select.Item value="90">90 days</Select.Item>
                        </Select.Content>
                      </Select.Root>
                    </label>

                    <label>
                      <Text size="1" weight="medium" mb="1" style={{ display: 'block' }}>Reason (optional)</Text>
                      <TextField.Root
                        placeholder="Why suppress this finding?"
                        value={suppressReason}
                        onChange={(e) => setSuppressReason(e.target.value)}
                      />
                    </label>
                  </Flex>

                  <Button
                    size="2"
                    color="orange"
                    onClick={handleSuppress}
                    disabled={suppressing}
                  >
                    {suppressing ? 'Suppressing...' : 'Suppress Finding'}
                  </Button>
                </Flex>
              </Card>

              {/* Raw Data (Debug) */}
              <details>
                <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--gray-10)' }}>
                  Show Raw Data
                </summary>
                <Box mt="2" p="2" style={{
                  backgroundColor: 'var(--gray-2)',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  maxHeight: '200px'
                }}>
                  <pre>{JSON.stringify(selectedFinding, null, 2)}</pre>
                </Box>
              </details>
            </Flex>
          )}

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button size="1" variant="soft" color="gray">
                Close
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      <style jsx>{`
        .hover-row:hover {
          background-color: var(--gray-3) !important;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </Box>
  );
};

export default EventLinter;
