import { Box, Flex, Text, Slider } from '@radix-ui/themes'

export default function RFMSliders({ values, onChange, disabled }) {
  function handleChange(field, value) {
    onChange({ [field]: value })
  }

  return (
    <Flex direction="column" gap="5">
      {/* Recency Score */}
      <Box>
        <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>
          Recency Score (days since last activity)
        </Text>
        <Flex justify="between" mb="2" style={{ fontSize: '12px', color: 'var(--gray-9)' }}>
          <Text>0 (No filter)</Text>
          <Text>1 (Inactive)</Text>
          <Text>5 (Very recent)</Text>
        </Flex>

        <Flex direction="column" gap="3">
          <Flex align="center" gap="3">
            <Text size="2" color="gray" style={{ width: '60px' }}>Min:</Text>
            <Box style={{ flex: 1 }}>
              <Slider
                value={[values.minRecencyScore]}
                onValueChange={(value) => handleChange('minRecencyScore', value[0])}
                min={0}
                max={5}
                step={1}
                disabled={disabled}
              />
            </Box>
            <Text size="2" weight="bold" style={{ width: '30px', textAlign: 'center' }}>
              {values.minRecencyScore}
            </Text>
          </Flex>

          <Flex align="center" gap="3">
            <Text size="2" color="gray" style={{ width: '60px' }}>Max:</Text>
            <Box style={{ flex: 1 }}>
              <Slider
                value={[values.maxRecencyScore]}
                onValueChange={(value) => handleChange('maxRecencyScore', value[0])}
                min={0}
                max={5}
                step={1}
                disabled={disabled}
              />
            </Box>
            <Text size="2" weight="bold" style={{ width: '30px', textAlign: 'center' }}>
              {values.maxRecencyScore}
            </Text>
          </Flex>
        </Flex>
      </Box>

      {/* Frequency Score */}
      <Box>
        <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>
          Frequency Score (total activities)
        </Text>
        <Flex justify="between" mb="2" style={{ fontSize: '12px', color: 'var(--gray-9)' }}>
          <Text>0 (No filter)</Text>
          <Text>1 (Low activity)</Text>
          <Text>5 (High activity)</Text>
        </Flex>

        <Flex direction="column" gap="3">
          <Flex align="center" gap="3">
            <Text size="2" color="gray" style={{ width: '60px' }}>Min:</Text>
            <Box style={{ flex: 1 }}>
              <Slider
                value={[values.minFrequencyScore]}
                onValueChange={(value) => handleChange('minFrequencyScore', value[0])}
                min={0}
                max={5}
                step={1}
                disabled={disabled}
              />
            </Box>
            <Text size="2" weight="bold" style={{ width: '30px', textAlign: 'center' }}>
              {values.minFrequencyScore}
            </Text>
          </Flex>

          <Flex align="center" gap="3">
            <Text size="2" color="gray" style={{ width: '60px' }}>Max:</Text>
            <Box style={{ flex: 1 }}>
              <Slider
                value={[values.maxFrequencyScore]}
                onValueChange={(value) => handleChange('maxFrequencyScore', value[0])}
                min={0}
                max={5}
                step={1}
                disabled={disabled}
              />
            </Box>
            <Text size="2" weight="bold" style={{ width: '30px', textAlign: 'center' }}>
              {values.maxFrequencyScore}
            </Text>
          </Flex>
        </Flex>
      </Box>

      {/* Monetary Score */}
      <Box>
        <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>
          Monetary Score (total spent)
        </Text>
        <Flex justify="between" mb="2" style={{ fontSize: '12px', color: 'var(--gray-9)' }}>
          <Text>0 (No filter)</Text>
          <Text>1 (Low spend)</Text>
          <Text>5 (High spend)</Text>
        </Flex>

        <Flex direction="column" gap="3">
          <Flex align="center" gap="3">
            <Text size="2" color="gray" style={{ width: '60px' }}>Min:</Text>
            <Box style={{ flex: 1 }}>
              <Slider
                value={[values.minMonetaryScore]}
                onValueChange={(value) => handleChange('minMonetaryScore', value[0])}
                min={0}
                max={5}
                step={1}
                disabled={disabled}
              />
            </Box>
            <Text size="2" weight="bold" style={{ width: '30px', textAlign: 'center' }}>
              {values.minMonetaryScore}
            </Text>
          </Flex>

          <Flex align="center" gap="3">
            <Text size="2" color="gray" style={{ width: '60px' }}>Max:</Text>
            <Box style={{ flex: 1 }}>
              <Slider
                value={[values.maxMonetaryScore]}
                onValueChange={(value) => handleChange('maxMonetaryScore', value[0])}
                min={0}
                max={5}
                step={1}
                disabled={disabled}
              />
            </Box>
            <Text size="2" weight="bold" style={{ width: '30px', textAlign: 'center' }}>
              {values.maxMonetaryScore}
            </Text>
          </Flex>
        </Flex>
      </Box>
    </Flex>
  )
}
