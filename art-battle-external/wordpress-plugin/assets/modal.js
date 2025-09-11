jQuery(document).ready(function($) {
    
    // Handle thumbnail clicks
    $(document).on('click', '.ab-artist-thumbnail', function() {
        var originalSrc = $(this).data('original');
        var artistName = $(this).data('artist');
        
        if (originalSrc) {
            $('#ab-modal-image').attr('src', originalSrc);
            $('#ab-modal-image').attr('alt', artistName + ' - Artwork');
            $('.ab-modal-caption').text(artistName);
            $('#ab-image-modal').fadeIn();
            
            // Prevent body scrolling when modal is open
            $('body').addClass('ab-modal-open');
        }
    });
    
    // Handle modal close
    $(document).on('click', '.ab-modal-close, .ab-modal', function(e) {
        if (e.target === this) {
            $('#ab-image-modal').fadeOut();
            $('body').removeClass('ab-modal-open');
        }
    });
    
    // Handle ESC key
    $(document).keyup(function(e) {
        if (e.keyCode === 27) { // ESC key
            $('#ab-image-modal').fadeOut();
            $('body').removeClass('ab-modal-open');
        }
    });
    
    // Prevent modal content clicks from closing modal
    $(document).on('click', '.ab-modal-content', function(e) {
        e.stopPropagation();
    });
    
});