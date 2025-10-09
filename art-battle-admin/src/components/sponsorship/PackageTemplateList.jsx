import { useState, useEffect, useRef } from 'react';
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
  DragHandleDots2Icon,
  ImageIcon
} from '@radix-ui/react-icons';
import {
  getAllPackageTemplates,
  createPackageTemplate,
  updatePackageTemplate,
  deletePackageTemplate,
  getPackageImages,
  uploadPackageImage,
  deletePackageImage,
  getAllCityPricing
} from '../../lib/sponsorshipAPI';

const PackageTemplateList = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Image modal state
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  // Package images state
  const [packageImages, setPackageImages] = useState([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);

  // City pricing state
  const [cityPricing, setCityPricing] = useState([]);

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

    // Load both templates and city pricing in parallel
    const [templatesResult, pricingResult] = await Promise.all([
      getAllPackageTemplates(),
      getAllCityPricing()
    ]);

    if (templatesResult.error) {
      setError(templatesResult.error);
    } else {
      setTemplates(templatesResult.data);
    }

    if (!pricingResult.error) {
      setCityPricing(pricingResult.data || []);
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
    loadPackageImages(template.id);
    setDialogOpen(true);
  };

  const loadPackageImages = async (templateId) => {
    if (!templateId) {
      setPackageImages([]);
      return;
    }

    setLoadingImages(true);
    const { data, error } = await getPackageImages(templateId);
    if (error) {
      console.error('Error loading package images:', error);
      setPackageImages([]);
    } else {
      setPackageImages(data || []);
    }
    setLoadingImages(false);
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !editingTemplate) return;

    setUploadingImage(true);
    setError(null);

    try {
      const result = await uploadPackageImage(file, editingTemplate.id);

      if (!result.success) {
        setError(result.error);
        return;
      }

      // Reload images
      await loadPackageImages(editingTemplate.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingImage(false);
      // Reset file input
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleDeleteImage = async (imageId) => {
    if (!confirm('Delete this image?')) return;

    setError(null);
    try {
      const result = await deletePackageImage(imageId);

      if (!result.success) {
        setError(result.error);
        return;
      }

      // Reload images
      if (editingTemplate) {
        await loadPackageImages(editingTemplate.id);
      }
    } catch (err) {
      setError(err.message);
    }
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
              <Table.ColumnHeaderCell>Cities</Table.ColumnHeaderCell>
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
                  {(() => {
                    const citiesWithPricing = cityPricing.filter(
                      cp => cp.package_template_id === template.id && cp.cities
                    );
                    const uniqueCities = [...new Set(citiesWithPricing.map(cp => cp.cities.name))];

                    return uniqueCities.length > 0 ? (
                      <Flex gap="1" wrap="wrap">
                        {uniqueCities.slice(0, 3).map((city, idx) => (
                          <Badge key={idx} color="blue" variant="soft" size="1">
                            {city}
                          </Badge>
                        ))}
                        {uniqueCities.length > 3 && (
                          <Text size="1" color="gray">
                            +{uniqueCities.length - 3} more
                          </Text>
                        )}
                      </Flex>
                    ) : (
                      <Text size="2" color="gray">No cities</Text>
                    );
                  })()}
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

            {/* Visual Samples Section - Only show for existing templates */}
            {editingTemplate && (
              <Box>
                <Text size="2" mb="2" weight="bold">Visual Samples</Text>
                <Text size="1" color="gray" mb="3" style={{ display: 'block' }}>
                  Upload images showing what's included in this sponsorship package
                </Text>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingImage}
                />

                <Flex gap="2" wrap="wrap">
                  {/* Existing images */}
                  {loadingImages ? (
                    <Box style={{ padding: '2rem', textAlign: 'center', width: '100%' }}>
                      <Spinner size="2" />
                      <Text size="1" color="gray" style={{ display: 'block', marginTop: '0.5rem' }}>
                        Loading images...
                      </Text>
                    </Box>
                  ) : (
                    <>
                      {packageImages.map((image) => (
                        <Box
                          key={image.id}
                          style={{
                            width: '100px',
                            height: '100px',
                            position: 'relative'
                          }}
                        >
                          <Box
                            onClick={() => {
                              setSelectedImage(image.url);
                              setImageModalOpen(true);
                            }}
                            style={{
                              width: '100%',
                              height: '100%',
                              backgroundColor: 'var(--gray-4)',
                              borderRadius: '6px',
                              border: '1px solid var(--gray-6)',
                              cursor: 'pointer',
                              transition: 'transform 0.2s ease, border-color 0.2s ease',
                              backgroundImage: `url(${image.url})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'scale(1.05)';
                              e.currentTarget.style.borderColor = 'var(--blue-8)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)';
                              e.currentTarget.style.borderColor = 'var(--gray-6)';
                            }}
                          />
                          {/* Delete button */}
                          <IconButton
                            size="1"
                            variant="solid"
                            color="red"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteImage(image.id);
                            }}
                            style={{
                              position: 'absolute',
                              top: '4px',
                              right: '4px',
                              width: '20px',
                              height: '20px',
                              padding: '0',
                              minWidth: '20px',
                              minHeight: '20px'
                            }}
                          >
                            <Cross2Icon />
                          </IconButton>
                        </Box>
                      ))}

                      {/* Add image button - always show */}
                      <Box
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          width: '100px',
                          height: '100px',
                          backgroundColor: uploadingImage ? 'var(--gray-3)' : 'var(--gray-4)',
                          borderRadius: '6px',
                          border: '2px dashed var(--gray-7)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: uploadingImage ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s ease',
                          opacity: uploadingImage ? 0.5 : 1
                        }}
                        onMouseEnter={(e) => {
                          if (!uploadingImage) {
                            e.currentTarget.style.backgroundColor = 'var(--gray-5)';
                            e.currentTarget.style.borderColor = 'var(--blue-8)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--gray-4)';
                          e.currentTarget.style.borderColor = 'var(--gray-7)';
                        }}
                      >
                        {uploadingImage ? (
                          <Spinner size="2" />
                        ) : (
                          <>
                            <PlusIcon size={24} color="var(--gray-9)" />
                            <Text size="1" color="gray" style={{ marginTop: '4px' }}>
                              Add Image
                            </Text>
                          </>
                        )}
                      </Box>
                    </>
                  )}
                </Flex>

                <Text size="1" color="gray" mt="2" style={{ display: 'block', fontStyle: 'italic' }}>
                  Click thumbnails to view full size • Click + to add new image • Click X to remove
                </Text>
              </Box>
            )}

            {!editingTemplate && (
              <Callout.Root color="blue">
                <Callout.Text>
                  Save the template first, then you can add visual samples by editing it.
                </Callout.Text>
              </Callout.Root>
            )}

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

      {/* Image Modal for Full-Screen View */}
      <Dialog.Root open={imageModalOpen} onOpenChange={setImageModalOpen}>
        <Dialog.Content style={{ maxWidth: '90vw', maxHeight: '90vh', padding: '0' }}>
          <Flex direction="column" style={{ height: '100%' }}>
            <Flex justify="between" align="center" p="3" style={{ borderBottom: '1px solid var(--gray-6)' }}>
              <Dialog.Title>Package Visual Sample</Dialog.Title>
              <Dialog.Close>
                <Button variant="ghost" size="1">
                  <Cross2Icon />
                </Button>
              </Dialog.Close>
            </Flex>

            <Box style={{ flex: 1, overflow: 'auto', padding: '1rem', textAlign: 'center' }}>
              {selectedImage && (
                <img
                  src={selectedImage}
                  alt="Package sample"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '70vh',
                    objectFit: 'contain',
                    borderRadius: '6px'
                  }}
                />
              )}
            </Box>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default PackageTemplateList;
