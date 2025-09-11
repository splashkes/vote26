<?php
/**
 * Plugin Name: Artb Artist Info Loader
 * Description: Display confirmed artists for Art Battle events using shortcode [art-battle-artists event="AB3333"]
 * Version: 1.1.2
 * Author: Art Battle
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

class ArtBattleArtistsDisplay {
    
    private $api_base_url = 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/wp-artists-export';
    private $cache_duration = 10800; // 3 hours in seconds
    
    public function __construct() {
        add_action('init', array($this, 'init'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_styles'));
        add_shortcode('art-battle-artists', array($this, 'shortcode_handler'));
        
        // Admin settings
        add_action('admin_menu', array($this, 'admin_menu'));
        add_action('admin_init', array($this, 'admin_init'));
        
        // Handle cache clearing
        add_action('admin_init', array($this, 'handle_cache_clear'));
    }
    
    public function init() {
        // Plugin initialization
    }
    
    public function enqueue_styles() {
        wp_enqueue_style(
            'art-battle-artists-display',
            plugin_dir_url(__FILE__) . 'assets/styles.css',
            array(),
            '1.1.2'
        );
        
        wp_enqueue_script(
            'art-battle-artists-modal',
            plugin_dir_url(__FILE__) . 'assets/modal.js',
            array('jquery'),
            '1.1.2',
            true
        );
    }
    
    public function shortcode_handler($atts) {
        $atts = shortcode_atts(array(
            'event' => '',
            'layout' => 'grid', // grid or list
            'show_images' => 'yes',
            'show_bios' => 'yes',
            'show_social' => 'yes'
        ), $atts, 'art-battle-artists');
        
        if (empty($atts['event'])) {
            return '<div class="ab-artists-error">Error: Event ID is required. Use [art-battle-artists event="AB3333"]</div>';
        }
        
        $event_data = $this->fetch_artists_data($atts['event']);
        
        if (!$event_data) {
            return '<div class="ab-artists-error">Error: Unable to load artist data for event ' . esc_html($atts['event']) . '</div>';
        }
        
        if (empty($event_data['artists'])) {
            return '<div class="ab-artists-empty">No confirmed artists found for event ' . esc_html($atts['event']) . '</div>';
        }
        
        return $this->render_artists($event_data, $atts);
    }
    
    private function fetch_artists_data($event_id) {
        $cache_key = 'ab_artists_' . sanitize_key($event_id);
        $cached_data = get_transient($cache_key);
        
        if ($cached_data !== false) {
            return $cached_data;
        }
        
        $url = $this->api_base_url . '?event=' . urlencode($event_id);
        $response = wp_remote_get($url, array(
            'timeout' => 15,
            'headers' => array(
                'User-Agent' => 'Art Battle WordPress Plugin/1.0.0'
            )
        ));
        
        if (is_wp_error($response)) {
            error_log('Art Battle API Error: ' . $response->get_error_message());
            return false;
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        if (!$data || !isset($data['success']) || !$data['success']) {
            error_log('Art Battle API Invalid Response: ' . $body);
            return false;
        }
        
        // Cache for 3 hours
        set_transient($cache_key, $data, $this->cache_duration);
        
        return $data;
    }
    
    private function render_artists($event_data, $atts) {
        $event = $event_data['event'];
        $artists = $event_data['artists'];
        
        $output = '<div class="ab-artists-container">';
        
        // Event header
        $output .= '<div class="ab-event-header">';
        $output .= '<h3>' . esc_html($event['name']) . '</h3>';
        if ($event['venue']) {
            $output .= '<p class="ab-event-venue">📍 ' . esc_html($event['venue']) . '</p>';
        }
        if ($event['date']) {
            $output .= '<p class="ab-event-date">📅 ' . esc_html($event['date']) . '</p>';
        }
        $artist_count_text = count($artists) . ' confirmed artists';
        if (count($artists) < 10) {
            $artist_count_text .= ' • <a href="https://artbattle.com/artists" target="_blank" class="ab-apply-now-link">APPLY NOW</a>';
        }
        $output .= '<p class="ab-artist-count">' . $artist_count_text . '</p>';
        $output .= '</div>';
        
        // Artists grid/list
        $layout_class = $atts['layout'] === 'list' ? 'ab-artists-list' : 'ab-artists-grid';
        $output .= '<div class="' . $layout_class . '">';
        
        foreach ($artists as $artist) {
            $output .= $this->render_single_artist($artist, $atts);
        }
        
        $output .= '</div>';
        
        // Footer
        $output .= '<div class="ab-artists-footer">';
        $output .= '<p class="ab-generated-time">Updated: ' . date('M j, Y g:i A', strtotime($event_data['generated_at'])) . '</p>';
        $output .= '</div>';
        
        $output .= '</div>';
        
        // Add modal HTML
        $output .= $this->get_modal_html();
        
        return $output;
    }
    
    private function render_single_artist($artist, $atts) {
        $output = '<div class="ab-artist-card">';
        
        // Artist image
        if ($atts['show_images'] === 'yes' && $artist['promo_image']) {
            $output .= '<div class="ab-artist-image">';
            $output .= '<img src="' . esc_url($artist['promo_image']['thumbnail']) . '" ';
            $output .= 'alt="' . esc_attr($artist['name']) . '" ';
            $output .= 'class="ab-artist-thumbnail" ';
            $output .= 'data-original="' . esc_url($artist['promo_image']['original']) . '" ';
            $output .= 'data-artist="' . esc_attr($artist['name']) . '" ';
            $output .= 'loading="lazy" />';
            $output .= '</div>';
        }
        
        $output .= '<div class="ab-artist-content">';
        
        // Artist name
        $output .= '<h4 class="ab-artist-name">' . esc_html($artist['name']) . '</h4>';
        
        // Location
        if ($artist['city']) {
            $output .= '<p class="ab-artist-city">📍 ' . esc_html($artist['city']) . '</p>';
        }
        
        // Bio
        if ($atts['show_bios'] === 'yes' && $artist['bio_html']) {
            $output .= '<div class="ab-artist-bio">' . wp_kses_post($artist['bio_html']) . '</div>';
        }
        
        // Social links
        if ($atts['show_social'] === 'yes') {
            $social_links = array();
            
            if ($artist['social_links']['instagram']) {
                $social_links[] = '<a href="' . esc_url($artist['social_links']['instagram']) . '" target="_blank" rel="noopener">📷 Instagram</a>';
            }
            
            if ($artist['social_links']['facebook']) {
                $social_links[] = '<a href="' . esc_url($artist['social_links']['facebook']) . '" target="_blank" rel="noopener">👥 Facebook</a>';
            }
            
            if ($artist['social_links']['website']) {
                $social_links[] = '<a href="' . esc_url($artist['social_links']['website']) . '" target="_blank" rel="noopener">🌐 Website</a>';
            }
            
            if (!empty($social_links)) {
                $output .= '<div class="ab-artist-social">' . implode(' • ', $social_links) . '</div>';
            }
        }
        
        $output .= '</div>'; // .ab-artist-content
        $output .= '</div>'; // .ab-artist-card
        
        return $output;
    }
    
    private function get_modal_html() {
        return '
        <div id="ab-image-modal" class="ab-modal" style="display: none;">
            <div class="ab-modal-content">
                <span class="ab-modal-close">&times;</span>
                <img id="ab-modal-image" src="" alt="">
                <div class="ab-modal-caption"></div>
            </div>
        </div>';
    }
    
    // Admin settings
    public function admin_menu() {
        add_options_page(
            'Artb Artist Info Loader',
            'Artb Artist Info Loader',
            'manage_options',
            'art-battle-artists',
            array($this, 'admin_page')
        );
    }
    
    public function admin_init() {
        register_setting('art_battle_artists_settings', 'ab_api_base_url');
        register_setting('art_battle_artists_settings', 'ab_cache_duration');
        
        add_settings_section(
            'ab_main_settings',
            'API Settings',
            null,
            'art_battle_artists_settings'
        );
        
        add_settings_field(
            'ab_api_base_url',
            'API Base URL',
            array($this, 'api_url_field'),
            'art_battle_artists_settings',
            'ab_main_settings'
        );
        
        add_settings_field(
            'ab_cache_duration',
            'Cache Duration (seconds)',
            array($this, 'cache_duration_field'),
            'art_battle_artists_settings',
            'ab_main_settings'
        );
    }
    
    public function admin_page() {
        ?>
        <div class="wrap">
            <h1>Artb Artist Info Loader Settings</h1>
            <form method="post" action="options.php">
                <?php
                settings_fields('art_battle_artists_settings');
                do_settings_sections('art_battle_artists_settings');
                submit_button();
                ?>
            </form>
            
            <h2>Usage</h2>
            <p>Use the following shortcode to display artists:</p>
            <code>[art-battle-artists event="AB3333"]</code>
            
            <h3>Shortcode Parameters:</h3>
            <ul>
                <li><strong>event</strong> (required): Event ID like AB3333</li>
                <li><strong>layout</strong> (optional): "grid" or "list" (default: grid)</li>
                <li><strong>show_images</strong> (optional): "yes" or "no" (default: yes)</li>
                <li><strong>show_bios</strong> (optional): "yes" or "no" (default: yes)</li>
                <li><strong>show_social</strong> (optional): "yes" or "no" (default: yes)</li>
            </ul>
            
            <h3>Example:</h3>
            <code>[art-battle-artists event="AB3053" layout="list" show_images="no"]</code>
            
            <h3>Clear Cache</h3>
            <p>
                <a href="<?php echo add_query_arg('ab_clear_cache', '1'); ?>" class="button">Clear All Artist Cache</a>
            </p>
        </div>
        <?php
    }
    
    public function api_url_field() {
        $value = get_option('ab_api_base_url', $this->api_base_url);
        echo '<input type="url" name="ab_api_base_url" value="' . esc_attr($value) . '" class="regular-text" />';
    }
    
    public function cache_duration_field() {
        $value = get_option('ab_cache_duration', $this->cache_duration);
        echo '<input type="number" name="ab_cache_duration" value="' . esc_attr($value) . '" min="300" max="86400" />';
        echo '<p class="description">Cache duration in seconds (min: 300, max: 86400)</p>';
    }
    
    public function handle_cache_clear() {
        if (isset($_GET['ab_clear_cache']) && $_GET['ab_clear_cache'] === '1' && current_user_can('manage_options')) {
            // Verify nonce for security (optional but recommended)
            $cleared = $this->clear_all_cache();
            
            if ($cleared) {
                add_action('admin_notices', function() {
                    echo '<div class="notice notice-success is-dismissible"><p>Artist cache cleared successfully!</p></div>';
                });
            } else {
                add_action('admin_notices', function() {
                    echo '<div class="notice notice-error is-dismissible"><p>Failed to clear cache.</p></div>';
                });
            }
            
            // Redirect to remove the query parameter
            $redirect_url = remove_query_arg('ab_clear_cache');
            wp_safe_redirect($redirect_url);
            exit;
        }
    }
    
    private function clear_all_cache() {
        try {
            global $wpdb;
            $result = $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_ab_artists_%' OR option_name LIKE '_transient_timeout_ab_artists_%'");
            return $result !== false;
        } catch (Exception $e) {
            error_log('Art Battle cache clear error: ' . $e->getMessage());
            return false;
        }
    }
}

// Initialize the plugin
new ArtBattleArtistsDisplay();
?>