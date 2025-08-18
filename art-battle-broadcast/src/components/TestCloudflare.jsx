import { useState } from 'react';
import { Box, Button, Card, Flex, Text, Heading, Code, Callout } from '@radix-ui/themes';
import { supabase } from '../lib/supabase';
import { getCloudflareConfig } from '../lib/cloudflare';

const TestCloudflare = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);

  // Test 1: Check Cloudflare Config Access
  const testConfigAccess = async () => {
    setLoading(true);
    try {
      const config = await getCloudflareConfig();
      setResults(prev => ({
        ...prev,
        configAccess: {
          success: !!config,
          data: config || 'No access - not an admin user'
        }
      }));
    } catch (error) {
      setResults(prev => ({
        ...prev,
        configAccess: {
          success: false,
          error: error.message
        }
      }));
    }
    setLoading(false);
  };

  // Test 2: Get Direct Upload URL
  const testGetUploadUrl = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('cloudflare-direct-upload', {
        body: {
          id: `test/${Date.now()}`,
          metadata: {
            test: true,
            timestamp: new Date().toISOString()
          },
          expiry: new Date(Date.now() + 30 * 60 * 1000).toISOString()
        }
      });

      if (error) throw error;

      setResults(prev => ({
        ...prev,
        uploadUrl: {
          success: true,
          data: data
        }
      }));
    } catch (error) {
      setResults(prev => ({
        ...prev,
        uploadUrl: {
          success: false,
          error: error.message
        }
      }));
    }
    setLoading(false);
  };

  // Test 3: Full Upload Test
  const testFullUpload = async () => {
    if (!selectedFile) {
      alert('Please select a file first');
      return;
    }

    setLoading(true);
    try {
      // Step 1: Get upload URL
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('cloudflare-direct-upload', {
        body: {
          id: `test/full-upload/${Date.now()}`,
          metadata: {
            test: true,
            fileName: selectedFile.name,
            fileSize: selectedFile.size
          }
        }
      });

      if (uploadError) throw uploadError;

      setResults(prev => ({
        ...prev,
        fullUpload: {
          ...prev.fullUpload,
          step1: {
            success: true,
            uploadUrl: uploadData.uploadURL,
            id: uploadData.id
          }
        }
      }));

      // Step 2: Upload to Cloudflare
      const formData = new FormData();
      formData.append('file', selectedFile);

      const uploadResponse = await fetch(uploadData.uploadURL, {
        method: 'POST',
        body: formData
      });

      const responseText = await uploadResponse.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status} - ${responseText}`);
      }

      setResults(prev => ({
        ...prev,
        fullUpload: {
          ...prev.fullUpload,
          step2: {
            success: true,
            status: uploadResponse.status,
            response: responseData
          }
        }
      }));

      // Step 3: Verify image URLs
      const possibleUrls = [
        `https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/${uploadData.id}/public`,
        `https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/${uploadData.id}/`,
        `https://imagedelivery.net/${uploadData.id}/public`,
        responseData?.result?.variants?.[0] // If Cloudflare returns variants
      ].filter(Boolean);

      const urlTests = await Promise.all(
        possibleUrls.map(async (url) => {
          try {
            const response = await fetch(url, { method: 'HEAD' });
            return { url, success: response.ok, status: response.status };
          } catch (error) {
            return { url, success: false, error: error.message };
          }
        })
      );

      setResults(prev => ({
        ...prev,
        fullUpload: {
          ...prev.fullUpload,
          step3: {
            urlTests,
            workingUrl: urlTests.find(t => t.success)?.url
          }
        }
      }));

    } catch (error) {
      setResults(prev => ({
        ...prev,
        fullUpload: {
          ...prev.fullUpload,
          error: error.message
        }
      }));
    }
    setLoading(false);
  };

  return (
    <Box p="4">
      <Heading size="6" mb="4">Cloudflare Integration Test</Heading>
      
      <Flex direction="column" gap="4">
        {/* Test 1: Config Access */}
        <Card>
          <Heading size="4" mb="3">Test 1: Check Config Access</Heading>
          <Button onClick={testConfigAccess} disabled={loading}>
            Test Config Access
          </Button>
          {results.configAccess && (
            <Box mt="3">
              <Code size="2">
                <pre>{JSON.stringify(results.configAccess, null, 2)}</pre>
              </Code>
            </Box>
          )}
        </Card>

        {/* Test 2: Get Upload URL */}
        <Card>
          <Heading size="4" mb="3">Test 2: Get Direct Upload URL</Heading>
          <Button onClick={testGetUploadUrl} disabled={loading}>
            Get Upload URL
          </Button>
          {results.uploadUrl && (
            <Box mt="3">
              <Code size="2">
                <pre>{JSON.stringify(results.uploadUrl, null, 2)}</pre>
              </Code>
            </Box>
          )}
        </Card>

        {/* Test 3: Full Upload */}
        <Card>
          <Heading size="4" mb="3">Test 3: Full Upload Test</Heading>
          <Flex direction="column" gap="3">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setSelectedFile(e.target.files[0])}
            />
            <Button 
              onClick={testFullUpload} 
              disabled={loading || !selectedFile}
            >
              Test Full Upload
            </Button>
          </Flex>
          {results.fullUpload && (
            <Box mt="3">
              <Code size="2">
                <pre>{JSON.stringify(results.fullUpload, null, 2)}</pre>
              </Code>
              {results.fullUpload.step3?.workingUrl && (
                <Callout.Root color="green" mt="3">
                  <Callout.Text>
                    Working URL: <a href={results.fullUpload.step3.workingUrl} target="_blank" rel="noopener noreferrer">
                      {results.fullUpload.step3.workingUrl}
                    </a>
                  </Callout.Text>
                </Callout.Root>
              )}
            </Box>
          )}
        </Card>

        {/* Instructions */}
        <Card>
          <Heading size="4" mb="3">How to Use</Heading>
          <ol>
            <li>Run Test 1 to verify you have admin access</li>
            <li>Run Test 2 to check if Edge Function can get upload URLs</li>
            <li>Select an image and run Test 3 to test the full upload flow</li>
          </ol>
          <Text size="2" color="gray" mt="3">
            The tests will help determine the correct delivery URL format for your Cloudflare setup.
          </Text>
        </Card>
      </Flex>
    </Box>
  );
};

export default TestCloudflare;