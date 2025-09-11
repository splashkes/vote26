import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  Container, 
  Heading, 
  Card, 
  Box, 
  Text, 
  Button,
  TextArea,
  TextField,
  Grid,
  Tabs,
  Select,
  Badge,
  Section
} from '@radix-ui/themes';
import { PlusIcon, TrashIcon, EyeOpenIcon } from '@radix-ui/react-icons';

const DesignerStudio = () => {
  const { user, signOut } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    kind: 'perArtist',
    spec: JSON.stringify({
      "$schema": "https://artbattle.app/template.v1.json",
      "name": "",
      "kind": "perArtist",
      "variants": [
        { "id": "square", "w": 1080, "h": 1080, "pixelRatio": 2 }
      ],
      "assets": {
        "frame": "",
        "logo": "",
        "fonts": []
      },
      "layers": {
        "underlay": {
          "source": "artist.sample_asset_url || event.bgFallback",
          "fit": "cover",
          "mask": true
        },
        "textHtml": "<div class=\"t-wrap\"><h1 class=\"title\">{event.title}</h1><p class=\"meta\">{event.city} • {event.date}</p></div>",
        "frame": "${assets.frame}",
        "logo": "${assets.logo}"
      },
      "css": ".t-wrap{position:absolute;inset:0;padding:48px;color:#fff}.title{font:700 92px/0.95 system-ui;text-transform:uppercase;text-shadow:2px 2px 6px #0008}",
      "animation": {
        "intro": [],
        "loop": []
      }
    }, null, 2)
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tmpl_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplate.name.trim()) {
      alert('Please enter a template name');
      return;
    }

    try {
      const spec = JSON.parse(newTemplate.spec);
      spec.name = newTemplate.name;
      spec.kind = newTemplate.kind;

      const { data, error } = await supabase
        .from('tmpl_templates')
        .insert([{
          name: newTemplate.name,
          kind: newTemplate.kind,
          spec: spec,
          published: false
        }])
        .select()
        .single();

      if (error) throw error;

      setTemplates([data, ...templates]);
      setNewTemplate({
        name: '',
        kind: 'perArtist',
        spec: newTemplate.spec
      });
      
      alert('Template created successfully!');
    } catch (err) {
      console.error('Error creating template:', err);
      alert('Error creating template: ' + err.message);
    }
  };

  const handleTogglePublished = async (templateId, currentStatus) => {
    try {
      const { error } = await supabase
        .from('tmpl_templates')
        .update({ published: !currentStatus })
        .eq('id', templateId);

      if (error) throw error;

      setTemplates(templates.map(t => 
        t.id === templateId ? { ...t, published: !currentStatus } : t
      ));
    } catch (err) {
      console.error('Error updating template:', err);
      alert('Error updating template');
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const { error } = await supabase
        .from('tmpl_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;

      setTemplates(templates.filter(t => t.id !== templateId));
      alert('Template deleted successfully');
    } catch (err) {
      console.error('Error deleting template:', err);
      alert('Error deleting template');
    }
  };

  return (
    <Container size="4">
      <Box py="6">
        {/* Header */}
        <Box mb="8" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Heading size="7" mb="2">
              Designer Studio
            </Heading>
            <Text size="3" color="gray">
              Welcome back, {user?.email}
            </Text>
          </Box>
          <Button variant="ghost" onClick={signOut}>
            Sign Out
          </Button>
        </Box>

        <Tabs.Root defaultValue="templates">
          <Tabs.List>
            <Tabs.Trigger value="templates">Templates</Tabs.Trigger>
            <Tabs.Trigger value="create">Create New</Tabs.Trigger>
            <Tabs.Trigger value="assets">Assets</Tabs.Trigger>
          </Tabs.List>

          {/* Templates Tab */}
          <Tabs.Content value="templates">
            <Section py="6">
              <Box mb="6" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Heading size="4">Template Library</Heading>
                <Text size="2" color="gray">{templates.length} templates</Text>
              </Box>

              {templates.length === 0 ? (
                <Box style={{ textAlign: 'center', padding: '60px 0' }}>
                  <Text size="3" color="gray">
                    No templates created yet. Create your first template!
                  </Text>
                </Box>
              ) : (
                <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
                  {templates.map((template) => (
                    <Card key={template.id} size="2">
                      <Box p="4">
                        <Box mb="3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Heading size="3">{template.name}</Heading>
                          <Badge 
                            variant={template.published ? 'solid' : 'soft'}
                            color={template.published ? 'green' : 'gray'}
                          >
                            {template.published ? 'Published' : 'Draft'}
                          </Badge>
                        </Box>

                        <Text size="2" color="gray" mb="4">
                          {template.kind === 'eventWide' ? 'Event-wide' : 'Per-artist'} template
                        </Text>

                        <Grid columns="3" gap="2">
                          <Button 
                            variant="soft" 
                            size="1"
                            onClick={() => handleTogglePublished(template.id, template.published)}
                          >
                            {template.published ? 'Unpublish' : 'Publish'}
                          </Button>
                          <Button variant="soft" size="1">
                            <EyeOpenIcon /> Preview
                          </Button>
                          <Button 
                            variant="soft" 
                            size="1" 
                            color="red"
                            onClick={() => handleDeleteTemplate(template.id)}
                          >
                            <TrashIcon />
                          </Button>
                        </Grid>
                      </Box>
                    </Card>
                  ))}
                </Grid>
              )}
            </Section>
          </Tabs.Content>

          {/* Create New Tab */}
          <Tabs.Content value="create">
            <Section py="6">
              <Heading size="4" mb="6">Create New Template</Heading>

              <Grid columns={{ initial: '1', md: '2' }} gap="6">
                <Box>
                  <Box mb="4">
                    <Text size="2" weight="bold" mb="2">Template Name</Text>
                    <TextField.Root
                      placeholder="e.g. AB Hype Square"
                      value={newTemplate.name}
                      onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
                    />
                  </Box>

                  <Box mb="4">
                    <Text size="2" weight="bold" mb="2">Template Kind</Text>
                    <Select.Root 
                      value={newTemplate.kind}
                      onValueChange={(value) => setNewTemplate({...newTemplate, kind: value})}
                    >
                      <Select.Trigger />
                      <Select.Content>
                        <Select.Item value="perArtist">Per-Artist</Select.Item>
                        <Select.Item value="eventWide">Event-Wide</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  </Box>

                  <Button onClick={handleCreateTemplate} size="3">
                    <PlusIcon /> Create Template
                  </Button>
                </Box>

                <Box>
                  <Text size="2" weight="bold" mb="2">Template Specification (JSON)</Text>
                  <TextArea
                    placeholder="Template spec JSON..."
                    value={newTemplate.spec}
                    onChange={(e) => setNewTemplate({...newTemplate, spec: e.target.value})}
                    style={{ minHeight: '400px', fontFamily: 'monospace', fontSize: '12px' }}
                  />
                </Box>
              </Grid>
            </Section>
          </Tabs.Content>

          {/* Assets Tab */}
          <Tabs.Content value="assets">
            <Section py="6">
              <Heading size="4" mb="6">Asset Management</Heading>
              <Box style={{ textAlign: 'center', padding: '60px 0' }}>
                <Text size="3" color="gray">
                  Asset upload functionality coming soon...
                </Text>
              </Box>
            </Section>
          </Tabs.Content>
        </Tabs.Root>
      </Box>
    </Container>
  );
};

export default DesignerStudio;