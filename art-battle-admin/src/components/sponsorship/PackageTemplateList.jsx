import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Table,
  Button,
  Badge,
  Flex,
  Text,
  Dialog,
  TextField,
  TextArea,
  Switch,
  Spinner,
  Callout,
  Select,
  IconButton,
  Heading
} from '@radix-ui/themes';
import {
  PlusIcon,
  Pencil1Icon,
  TrashIcon,
  Cross2Icon,
  CheckIcon,
  DragHandleDots2Icon
} from '@radix-ui/react-icons';
import {
  getAllPackageTemplates,
  createPackageTemplate,
  updatePackageTemplate,
  deletePackageTemplate
} from '../../lib/sponsorshipAPI';

const PackageTemplateList = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    benefits: [],
    category: 'main',
    display_order: 0,
    active: true
  });
  const [benefitInput, setBenefitInput] = useState('');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    const { data, error } = await getAllPackageTemplates();
    if (error) {
      setError(error);
    } else {
      setTemplates(data);
    }
    setLoading(false);
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      slug: '',
      description: '',
      benefits: [],
      category: 'main',
      display_order: templates.length,
      active: true
    });
    setBenefitInput('');
    setDialogOpen(true);
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      slug: template.slug,
      description: template.description || '',
      benefits: template.benefits || [],
      category: template.category,
      display_order: template.display_order,
      active: template.active
    });
    setBenefitInput('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        slug: formData.slug || formData.name.toLowerCase().replace(/\s+/g, '-')
      };

      if (editingTemplate) {
        await updatePackageTemplate(editingTemplate.id, payload);
      } else {
        await createPackageTemplate(payload);
      }

      await loadTemplates();
      setDialogOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this package template? This will affect all events using this template.')) {
      return;
    }

    const { error } = await deletePackageTemplate(id);
    if (error) {
      setError(error);
    } else {
      await loadTemplates();
    }
  };

  const addBenefit = () => {
    if (benefitInput.trim()) {
      setFormData({
        ...formData,
        benefits: [...formData.benefits, benefitInput.trim()]
      });
      setBenefitInput('');
    }
  };

  const removeBenefit = (index) => {
    setFormData({
      ...formData,
      benefits: formData.benefits.filter((_, i) => i !== index)
    });
  };

  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: '200px' }}>
        <Spinner size="3" />
      </Flex>
    );
  }

  return (
    <Box>
      {error && (
        <Callout.Root color="red" mb="4">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      <Flex justify="between" align="center" mb="4">
        <Box>
          <Heading size="5">Package Templates</Heading>
          <Text size="2" color="gray">
            Create reusable sponsorship packages that can be applied to any event
          </Text>
        </Box>
        <Button onClick={handleCreate}>
          <PlusIcon /> Create Template
        </Button>
      </Flex>

      {templates.length === 0 ? (
        <Card>
          <Flex direction="column" align="center" gap="3" style={{ padding: '3rem' }}>
            <Text size="4" color="gray">No package templates yet</Text>
            <Button onClick={handleCreate}>
              <PlusIcon /> Create Your First Template
            </Button>
          </Flex>
        </Card>
      ) : (
        <Table.Root variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell width="30px"></Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Package Name</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Category</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Benefits</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell width="120px">Actions</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>

          <Table.Body>
            {templates.map((template) => (
              <Table.Row key={template.id}>
                <Table.Cell>
                  <DragHandleDots2Icon color="gray" />
                </Table.Cell>
                <Table.Cell>
                  <Box>
                    <Text weight="bold">{template.name}</Text>
                    <Text size="1" color="gray" style={{ display: 'block' }}>
                      {template.description?.substring(0, 60)}
                      {template.description?.length > 60 ? '...' : ''}
                    </Text>
                  </Box>
                </Table.Cell>
                <Table.Cell>
                  <Badge color={template.category === 'main' ? 'blue' : 'orange'}>
                    {template.category === 'main' ? 'Main Package' : 'Add-on'}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <Text size="2" color="gray">
                    {template.benefits?.length || 0} benefits
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge color={template.active ? 'green' : 'gray'}>
                    {template.active ? 'Active' : 'Inactive'}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <Flex gap="2">
                    <IconButton
                      size="1"
                      variant="soft"
                      onClick={() => handleEdit(template)}
                    >
                      <Pencil1Icon />
                    </IconButton>
                    <IconButton
                      size="1"
                      variant="soft"
                      color="red"
                      onClick={() => handleDelete(template.id)}
                    >
                      <TrashIcon />
                    </IconButton>
                  </Flex>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}

      {/* Edit/Create Dialog */}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Content style={{ maxWidth: '600px' }}>
          <Dialog.Title>
            {editingTemplate ? 'Edit Package Template' : 'Create Package Template'}
          </Dialog.Title>

          <Flex direction="column" gap="4" mt="4">
            <Box>
              <Text size="2" mb="1" weight="bold">Package Name *</Text>
              <TextField.Root
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Title Sponsor"
              />
            </Box>

            <Box>
              <Text size="2" mb="1" weight="bold">Slug</Text>
              <TextField.Root
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="Auto-generated from name"
              />
              <Text size="1" color="gray">
                Used in URLs. Leave blank to auto-generate.
              </Text>
            </Box>

            <Box>
              <Text size="2" mb="1" weight="bold">Description</Text>
              <TextArea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this sponsorship package"
                rows={3}
              />
            </Box>

            <Box>
              <Text size="2" mb="1" weight="bold">Category</Text>
              <Select.Root
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <Select.Trigger style={{ width: '100%' }} />
                <Select.Content>
                  <Select.Item value="main">Main Package</Select.Item>
                  <Select.Item value="addon">Add-on</Select.Item>
                </Select.Content>
              </Select.Root>
            </Box>

            <Box>
              <Text size="2" mb="2" weight="bold">Benefits</Text>
              <Flex direction="column" gap="2">
                {formData.benefits.map((benefit, index) => (
                  <Flex key={index} gap="2" align="center">
                    <CheckIcon color="green" />
                    <Text size="2" style={{ flex: 1 }}>{benefit}</Text>
                    <IconButton
                      size="1"
                      variant="ghost"
                      color="red"
                      onClick={() => removeBenefit(index)}
                    >
                      <Cross2Icon />
                    </IconButton>
                  </Flex>
                ))}

                <Flex gap="2">
                  <TextField.Root
                    value={benefitInput}
                    onChange={(e) => setBenefitInput(e.target.value)}
                    placeholder="Add a benefit"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addBenefit();
                      }
                    }}
                    style={{ flex: 1 }}
                  />
                  <Button onClick={addBenefit} variant="soft">
                    <PlusIcon />
                  </Button>
                </Flex>
              </Flex>
            </Box>

            <Flex gap="3">
              <Box style={{ flex: 1 }}>
                <Text size="2" mb="1" weight="bold">Display Order</Text>
                <TextField.Root
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                />
              </Box>

              <Box style={{ flex: 1 }}>
                <Flex align="center" justify="between" style={{ height: '100%' }}>
                  <Text size="2" weight="bold">Active</Text>
                  <Switch
                    checked={formData.active}
                    onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                  />
                </Flex>
              </Box>
            </Flex>

            <Flex gap="3" justify="end" mt="4">
              <Button variant="soft" color="gray" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!formData.name || saving}>
                {saving ? 'Saving...' : 'Save Template'}
              </Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default PackageTemplateList;
