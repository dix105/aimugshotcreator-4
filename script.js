document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // GLOBAL STATE & CONSTANTS
    // ==========================================
    let currentUploadedUrl = null;
    const USER_ID = 'DObRu1vyStbUynoQmTcHBlhs55z2';
    const POLL_INTERVAL = 2000; // 2 seconds
    const MAX_POLLS = 60; // Max 2 minutes

    // ==========================================
    // 1. MOBILE MENU TOGGLE
    // ==========================================
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('header nav');
    
    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            menuToggle.textContent = nav.classList.contains('active') ? '✕' : '☰';
        });

        // Close menu when clicking a link
        nav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                menuToggle.textContent = '☰';
            });
        });
    }

    // ==========================================
    // 2. BACKEND API FUNCTIONS
    // ==========================================

    // Generate nanoid for unique filename
    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Upload file to CDN storage
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        // Filename is just nanoid.extension (no media/ prefix)
        const fileName = uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL from API
        const signedUrlResponse = await fetch(
            'https://api.chromastudio.ai/get-emd-upload-url?fileName=' + encodeURIComponent(fileName),
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        console.log('Got signed URL');
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        const downloadUrl = 'https://contents.maxstudio.ai/' + fileName;
        console.log('Uploaded to:', downloadUrl);
        return downloadUrl;
    }

    // Submit generation job
    async function submitImageGenJob(imageUrl) {
        // Config for Mugshot
        const isVideo = false; // 'image-effects' === 'video-effects'
        const endpoint = 'https://api.chromastudio.ai/image-gen';
        
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'sec-ch-ua-platform': '"Windows"',
            'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'sec-ch-ua-mobile': '?0'
        };

        const body = {
            model: 'image-effects',
            toolType: 'image-effects',
            effectId: 'mugshot',
            imageUrl: imageUrl,
            userId: USER_ID,
            removeWatermark: true,
            isPrivate: true
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        console.log('Job submitted:', data.jobId, 'Status:', data.status);
        return data;
    }

    // Poll job status
    async function pollJobStatus(jobId) {
        const baseUrl = 'https://api.chromastudio.ai/image-gen';
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${baseUrl}/${USER_ID}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/plain, */*'
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to check status: ' + response.statusText);
            }
            
            const data = await response.json();
            console.log('Poll', polls + 1, '- Status:', data.status);
            
            if (data.status === 'completed') {
                // Determine result URL structure
                const resultItem = Array.isArray(data.result) ? data.result[0] : data.result;
                const resultUrl = resultItem?.mediaUrl || resultItem?.video || resultItem?.image;
                
                if(resultUrl) {
                    console.log('Job completed! Result:', resultUrl);
                    // Standardize return format
                    return { ...data, resultUrl: resultUrl };
                }
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            // Update UI with progress
            updateStatus('PROCESSING... (' + (polls + 1) + ')');
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out after ' + MAX_POLLS + ' polls');
    }

    // ==========================================
    // 3. UI HELPER FUNCTIONS
    // ==========================================

    function showLoading() {
        const loader = document.getElementById('loading-state');
        const resultContainer = document.getElementById('result-container');
        if (loader) loader.classList.remove('hidden'); // Use classList for consistency with existing CSS
        if (loader) loader.style.display = 'flex'; // Force flex for centering
        if (resultContainer) resultContainer.classList.add('loading');
        
        // Hide placeholders during loading
        const placeholder = document.querySelector('.placeholder-content');
        if (placeholder) placeholder.classList.add('hidden');
    }

    function hideLoading() {
        const loader = document.getElementById('loading-state');
        const resultContainer = document.getElementById('result-container');
        if (loader) loader.classList.add('hidden');
        if (loader) loader.style.display = 'none';
        if (resultContainer) resultContainer.classList.remove('loading');
    }

    function updateStatus(text) {
        // Update button text
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            if (text.includes('PROCESSING') || text.includes('UPLOADING') || text.includes('SUBMITTING')) {
                generateBtn.disabled = true;
                generateBtn.textContent = text;
            } else if (text === 'READY' || text === 'COMPLETE') {
                generateBtn.disabled = false;
                generateBtn.textContent = text === 'COMPLETE' ? 'GENERATE AGAIN' : 'APPLY EFFECT';
            } else {
                generateBtn.textContent = text;
            }
        }
    }

    function showError(msg) {
        alert('Error: ' + msg);
        updateStatus('ERROR');
    }

    function showPreview(url) {
        const img = document.getElementById('preview-image');
        const uploadContent = document.querySelector('.upload-content');
        const resetBtn = document.getElementById('reset-btn');
        const generateBtn = document.getElementById('generate-btn');

        if (img) {
            img.src = url;
            img.classList.remove('hidden');
        }
        if (uploadContent) uploadContent.classList.add('hidden');
        if (resetBtn) resetBtn.classList.remove('hidden');
        if (generateBtn) generateBtn.disabled = false;
    }

    function showResultMedia(url) {
        const resultImg = document.getElementById('result-final');
        const downloadBtn = document.getElementById('download-btn');
        
        if (resultImg) {
            resultImg.classList.remove('hidden');
            resultImg.style.display = 'block';
            resultImg.crossOrigin = 'anonymous';
            resultImg.src = url;
            // Remove mock filters if any exist in CSS/JS
            resultImg.style.filter = 'none';
        }

        if (downloadBtn) {
            downloadBtn.dataset.url = url;
            downloadBtn.classList.remove('disabled');
            downloadBtn.style.display = 'inline-block';
        }
    }

    // ==========================================
    // 4. MAIN LOGIC HANDLERS
    // ==========================================

    // Handler when file is selected - uploads immediately
    async function handleFileSelect(file) {
        if (!file) return;
        
        try {
            // Show local preview immediately (optional UX improvement while uploading)
            const localUrl = URL.createObjectURL(file);
            showPreview(localUrl);

            // Start backend upload
            updateStatus('UPLOADING...');
            
            // Upload immediately
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // Refresh preview with remote URL to ensure consistency
            showPreview(uploadedUrl);
            
            updateStatus('READY');
            
        } catch (error) {
            updateStatus('ERROR');
            showError(error.message);
            // Reset UI on failure
            const resetBtn = document.getElementById('reset-btn');
            if (resetBtn) resetBtn.click();
        }
    }

    // Handler when Generate button is clicked
    async function handleGenerate() {
        if (!currentUploadedUrl) {
            alert("Please upload an image first.");
            return;
        }
        
        try {
            showLoading();
            updateStatus('SUBMITTING...');
            
            // Hide previous result
            const resultImg = document.getElementById('result-final');
            if (resultImg) resultImg.classList.add('hidden');

            // Step 1: Submit job
            const jobData = await submitImageGenJob(currentUploadedUrl);
            console.log('Job ID:', jobData.jobId);
            
            updateStatus('QUEUED...');
            
            // Step 2: Poll for completion
            const resultData = await pollJobStatus(jobData.jobId);
            
            // Step 3: Display result
            showResultMedia(resultData.resultUrl);
            
            updateStatus('COMPLETE');
            hideLoading();
            
        } catch (error) {
            hideLoading();
            updateStatus('ERROR');
            showError(error.message);
        }
    }

    // ==========================================
    // 5. EVENT WIRING
    // ==========================================
    
    const dropZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const generateBtn = document.getElementById('generate-btn');
    const resetBtn = document.getElementById('reset-btn');
    const downloadBtn = document.getElementById('download-btn');

    // File Input Change
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFileSelect(file);
        });
    }

    // Drag & Drop
    if (dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        dropZone.addEventListener('dragenter', () => dropZone.classList.add('highlight'));
        dropZone.addEventListener('dragover', () => dropZone.classList.add('highlight'));
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('highlight'));
        
        dropZone.addEventListener('drop', (e) => {
            dropZone.classList.remove('highlight');
            const dt = e.dataTransfer;
            const file = dt.files[0];
            if (file) handleFileSelect(file);
        });

        // Click to upload
        dropZone.addEventListener('click', () => {
            if (fileInput) fileInput.click();
        });
    }

    // Generate Button
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }

    // Reset Button
    if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Clear state
            currentUploadedUrl = null;
            if (fileInput) fileInput.value = '';
            
            // Reset UI
            const previewImage = document.getElementById('preview-image');
            const uploadContent = document.querySelector('.upload-content');
            const resultImage = document.getElementById('result-final');
            const placeholderContent = document.querySelector('.placeholder-content');
            
            if (previewImage) {
                previewImage.src = '';
                previewImage.classList.add('hidden');
            }
            if (uploadContent) uploadContent.classList.remove('hidden');
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.textContent = 'APPLY EFFECT';
            }
            if (resetBtn) resetBtn.classList.add('hidden');
            
            if (resultImage) {
                resultImage.src = '';
                resultImage.classList.add('hidden');
            }
            if (placeholderContent) placeholderContent.classList.remove('hidden');
            if (downloadBtn) {
                downloadBtn.classList.add('disabled');
                delete downloadBtn.dataset.url;
            }
            
            hideLoading();
        });
    }

    // Download Button - Robust Implementation
    if (downloadBtn) {
        // Remove default href behavior to control via JS
        downloadBtn.removeAttribute('href'); 
        
        downloadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const url = downloadBtn.dataset.url;
            if (!url) return;
            
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Downloading...';
            downloadBtn.classList.add('disabled'); // visual disable
            
            try {
                // Strategy 1: Fetch Blob
                const response = await fetch(url, {
                    mode: 'cors',
                    credentials: 'omit'
                });
                
                if (!response.ok) throw new Error('Network response was not ok');
                
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = 'mugshot_result_' + generateNanoId(6) + '.jpg';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                
            } catch (err) {
                console.error('Download error:', err);
                // Strategy 2: Canvas Fallback
                try {
                    const img = document.getElementById('result-final');
                    if (img && img.complete && img.naturalWidth > 0) {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        
                        canvas.toBlob((blob) => {
                            const link = document.createElement('a');
                            link.href = URL.createObjectURL(blob);
                            link.download = 'mugshot_result_fallback.png';
                            link.click();
                        }, 'image/png');
                        return;
                    }
                } catch (canvasErr) {
                    console.error('Canvas fallback failed', canvasErr);
                }
                
                // Strategy 3: New Tab
                window.open(url, '_blank');
            } finally {
                downloadBtn.textContent = originalText;
                downloadBtn.classList.remove('disabled');
            }
        });
    }

    // ==========================================
    // 6. FAQ ACCORDION (Preserved)
    // ==========================================
    const faqQuestions = document.querySelectorAll('.faq-question');
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const answer = question.nextElementSibling;
            question.classList.toggle('active');
            if (question.classList.contains('active')) {
                answer.style.maxHeight = answer.scrollHeight + "px";
            } else {
                answer.style.maxHeight = 0;
            }
            faqQuestions.forEach(otherQuestion => {
                if (otherQuestion !== question) {
                    otherQuestion.classList.remove('active');
                    otherQuestion.nextElementSibling.style.maxHeight = 0;
                }
            });
        });
    });

    // ==========================================
    // 7. MODALS (Preserved)
    // ==========================================
    const modalTriggers = document.querySelectorAll('[data-modal-target]');
    const closeButtons = document.querySelectorAll('[data-modal-close]');
    
    function openModal(modalId) {
        const modal = document.getElementById(modalId + '-modal');
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModal(modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    modalTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            const target = trigger.getAttribute('data-modal-target');
            openModal(target);
        });
    });

    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            closeModal(modal);
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target);
        }
    });

    // ==========================================
    // 8. SCROLL ANIMATIONS (Preserved)
    // ==========================================
    const observerOptions = { threshold: 0.1 };
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.step-card, .gallery-item, .testimonial-card').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    const style = document.createElement('style');
    style.innerHTML = `
        .visible {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);

    const yearSpan = document.getElementById('year');
    if(yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
    }
});