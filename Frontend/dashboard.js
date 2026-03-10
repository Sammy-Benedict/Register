// ============================================================================
// STUDENT DASHBOARD - REGISTRATION & PROFILE MANAGEMENT
// ============================================================================
// This script manages the student dashboard including registration form,
// profile display, and payment processing.
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // ========================================================================
    // AUTHENTICATION & CONFIGURATION
    // ========================================================================

    const getAuthToken = () => {
        const directToken = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
        if (directToken) return directToken;
        try {
            const saved = JSON.parse(localStorage.getItem('studentData') || '{}');
            return saved.token || '';
        } catch (error) {
            return '';
        }
    };

    // Verify student is authenticated
    const authToken = getAuthToken();
    if (!authToken) {
        window.location.href = 'student-login.html';
        return;
    }

    // API configuration
    const API_BASE = window.location.origin|| 'http://localhost:5000';
    
    // Get selected department from session/query params
    const urlParams = new URLSearchParams(window.location.search);
    const selectedDept = sessionStorage.getItem('selectedDepartment') || 
                        urlParams.get('department') || 
                        localStorage.getItem('studentDepartment') || 
                        'Pending Selection';
    
    // ========================================================================
    // DOM ELEMENTS
    // ========================================================================

    // Form elements
    const registrationForm = document.getElementById('registrationForm');
    const formMessage = document.getElementById('formMessage');
    const payBtn = document.getElementById('payBtn');

    // Payment modal elements
    const paymentModal = document.getElementById('paymentModal');
    const closePaymentModal = document.getElementById('closePaymentModal');
    const paymentModalMessage = document.getElementById('paymentModalMessage');
    const paymentDetailsForm = document.getElementById('paymentDetailsForm');
    const paymentConfirmStep = document.getElementById('paymentConfirmStep');
    const paymentAmount = document.getElementById('paymentAmount');
    const modalMobilePhone = document.getElementById('modalMobilePhone');
    const modalMobileProvider = document.getElementById('modalMobileProvider');
    const makePaymentBtn = document.getElementById('makePaymentBtn');
    const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');
    const confirmPaymentBtn = document.getElementById('confirmPaymentBtn');
    const closeConfirmBtn = document.getElementById('closeConfirmBtn');
    const paymentReference = document.getElementById('paymentReference');

    // State variables
    let latestStudentId = null;
    let latestPaymentReference = null;
    let currentRegistrationFee = 0;
    let paymentData = { phone: null, provider: null };
    const draftScope = String(selectedDept || 'default')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'default';
    const DRAFT_KEY = `registrationDraftV1_${draftScope}`;
    const DRAFT_FILE_DB = `registrationDraftFiles_${draftScope}`;
    const FILE_FIELD_NAMES = ['passportPicture', 'wassceCertificate', 'feesReceipt', 'courseRegistrationForm'];
    const cachedFiles = {};

    // ========================================================================
    // UTILITY FUNCTIONS
    // ========================================================================

    /**
     * Display a message in the registration form
     */
    const setMessage = (message, type = 'info') => {
        if (!formMessage) return;
        formMessage.textContent = message;
        formMessage.className = `info-banner ${type}`;
    };

    /**
     * Display a message in the payment modal
     */
    const setModalMessage = (message, type = 'info') => {
        if (!paymentModalMessage) return;
        paymentModalMessage.textContent = message;
        paymentModalMessage.className = `info-banner ${type}`;
        if (message) {
            paymentModalMessage.classList.remove('hidden');
        } else {
            paymentModalMessage.classList.add('hidden');
        }
    };

    const getDraftData = () => {
        try {
            return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
        } catch (error) {
            return {};
        }
    };

    const saveDraftData = () => {
        if (!registrationForm) return;
        const payload = {
            fullName: registrationForm.elements['fullName']?.value || '',
            email: registrationForm.elements['email']?.value || '',
            telephone: registrationForm.elements['telephone']?.value || '',
            indexNumber: registrationForm.elements['indexNumber']?.value || '',
            level: registrationForm.elements['level']?.value || '',
            programme: registrationForm.elements['programme']?.value || '',
            programClass: registrationForm.elements['programClass']?.value || ''
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    };

    const restoreDraftData = () => {
        if (!registrationForm) return;
        const draft = getDraftData();
        const assignIfEmpty = (name, value) => {
            const field = registrationForm.elements[name];
            if (field && !field.value && value) field.value = value;
        };
        assignIfEmpty('fullName', draft.fullName);
        assignIfEmpty('email', draft.email);
        assignIfEmpty('telephone', draft.telephone);
        assignIfEmpty('indexNumber', draft.indexNumber);
        assignIfEmpty('level', draft.level);
        assignIfEmpty('programme', draft.programme);
        assignIfEmpty('programClass', draft.programClass);
    };

    const clearDraftData = () => {
        localStorage.removeItem(DRAFT_KEY);
    };

    const openDraftFileDb = () => new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB not supported'));
            return;
        }
        const request = indexedDB.open(DRAFT_FILE_DB, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('files')) {
                db.createObjectStore('files', { keyPath: 'fieldName' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
    });

    const withFileStore = async (mode, fn) => {
        const db = await openDraftFileDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('files', mode);
            const store = tx.objectStore('files');
            let result;
            try {
                result = fn(store);
            } catch (error) {
                db.close();
                reject(error);
                return;
            }
            tx.oncomplete = () => {
                db.close();
                resolve(result);
            };
            tx.onerror = () => {
                db.close();
                reject(tx.error || new Error('IndexedDB transaction failed'));
            };
        });
    };

    const syncFileRequiredState = (fieldName) => {
        const input = registrationForm?.elements[fieldName];
        if (!input) return;
        input.required = !cachedFiles[fieldName];
    };

    const setFileInputFromFile = (input, file) => {
        if (!input || !file) return false;
        try {
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            return true;
        } catch (error) {
            return false;
        }
    };

    const saveFileDraft = async (fieldName, file) => {
        const data = await file.arrayBuffer();
        await withFileStore('readwrite', (store) => {
            store.put({
                fieldName,
                fileName: file.name,
                type: file.type,
                lastModified: file.lastModified,
                data
            });
        });
    };

    const deleteFileDraft = async (fieldName) => {
        await withFileStore('readwrite', (store) => {
            store.delete(fieldName);
        });
    };

    const clearAllFileDrafts = async () => {
        await withFileStore('readwrite', (store) => {
            store.clear();
        });
    };

    const loadFileDraft = async (fieldName) => {
        const db = await openDraftFileDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('files', 'readonly');
            const store = tx.objectStore('files');
            const req = store.get(fieldName);
            req.onsuccess = () => {
                const record = req.result;
                db.close();
                if (!record) {
                    resolve(null);
                    return;
                }
                const file = new File([record.data], record.fileName, {
                    type: record.type || 'application/octet-stream',
                    lastModified: record.lastModified || Date.now()
                });
                resolve(file);
            };
            req.onerror = () => {
                db.close();
                reject(req.error || new Error('Failed to read file draft'));
            };
        });
    };

    const restoreFileDrafts = async () => {
        if (!registrationForm) return;
        for (const fieldName of FILE_FIELD_NAMES) {
            const input = registrationForm.elements[fieldName];
            if (!input) continue;
            try {
                const file = await loadFileDraft(fieldName);
                if (!file) {
                    delete cachedFiles[fieldName];
                    syncFileRequiredState(fieldName);
                    continue;
                }
                cachedFiles[fieldName] = file;
                setFileInputFromFile(input, file);
                syncFileRequiredState(fieldName);
            } catch (error) {
                // If IndexedDB is unavailable, keep normal browser behavior.
                syncFileRequiredState(fieldName);
            }
        }
    };

    /**
     * Get custom payment amount from user input
     */
    const getCustomAmount = () => {
        const amount = parseFloat(paymentAmount?.value || '0');
        return isNaN(amount) || amount <= 0 ? 0 : amount;
    };

    /**
     * Open payment modal
     */
    const openPaymentModal = () => {
        if (!paymentModal) return;
        paymentModal.classList.remove('hidden');
        paymentDetailsForm.classList.remove('hidden');
        paymentConfirmStep.classList.add('hidden');
        setModalMessage('', 'info');
        // Clear payment fields
        if (paymentAmount) paymentAmount.value = '';
        if (modalMobilePhone) modalMobilePhone.value = '';
        if (modalMobileProvider) modalMobileProvider.value = '';
        // Focus on amount field for quick input
        if (paymentAmount) paymentAmount.focus();
    };

    /**
     * Close payment modal
     */
    const closePaymentModalHandler = () => {
        if (!paymentModal) return;
        paymentModal.classList.add('hidden');
        setModalMessage('', 'info');
    };

    /**
     * Show payment confirmation
     */
    const showPaymentConfirmation = (reference) => {
        if (!paymentDetailsForm || !paymentConfirmStep || !paymentReference) return;
        latestPaymentReference = reference;
        paymentDetailsForm.classList.add('hidden');
        paymentConfirmStep.classList.remove('hidden');
        paymentReference.textContent = `Reference: ${reference}`;
        
        // Enable the Register Account button so student can complete registration
        const submitBtn = registrationForm?.querySelector('.submit');
        if (submitBtn) {
            submitBtn.disabled = false;
        }
    };

    /**
     * Create or update provisional student record
     */
    const createProvisionalStudent = async () => {
        try {
            const formData = new FormData(registrationForm);
            const payload = {
                fullName: formData.get('fullName'),
                indexNumber: formData.get('indexNumber'),
                email: formData.get('email'),
                telephone: formData.get('telephone'),
                level: formData.get('level'),
                programme: formData.get('programme'),
                programClass: formData.get('programClass'),
                programType: `${formData.get('programme')} - ${formData.get('programClass')}`
            };

            // Check if we already have a provisional student from department selection
            const existingStudentId = sessionStorage.getItem('provisionalStudentId');
            let url = `${API_BASE}/api/students/provisional`;
            let method = 'POST';

            if (existingStudentId) {
                // Update existing provisional student
                url = `${API_BASE}/api/students/${existingStudentId}`;
                method = 'PUT';
                payload._id = existingStudentId; // Include ID for update
            }

            const headers = {
                'Content-Type': 'application/json'
            };
            
            // Provisional student creation does NOT require authentication
            // Remove any existing auth header for this request
            // if (authToken) {
            //     headers['Authorization'] = `Bearer ${authToken}`;
            // }

            let resp = await fetch(url, {
                method: method,
                headers: headers,
                body: JSON.stringify(payload)
            });

            let result = await resp.json().catch(() => ({}));

            // If cached provisional ID is stale, create a new provisional record.
            if (existingStudentId && method === 'PUT' && resp.status === 404) {
                sessionStorage.removeItem('provisionalStudentId');
                resp = await fetch(`${API_BASE}/api/students/provisional`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(payload)
                });
                result = await resp.json().catch(() => ({}));
            }

            if (!resp.ok || result.status !== 'success') {
                setModalMessage(result.message || 'Failed to save provisional student', 'error');
                return false;
            }

            latestStudentId = result.student?._id || existingStudentId || null;
            if (latestStudentId) {
                sessionStorage.setItem('provisionalStudentId', latestStudentId);
            }
            localStorage.setItem('studentData', JSON.stringify({
                studentId: latestStudentId,
                fullName: payload.fullName,
                email: payload.email,
                programme: payload.programme,
                level: payload.level,
                paymentStatus: 'Pending'
            }));

            return true;
        } catch (error) {
            console.error('Error saving provisional student:', error);
            setModalMessage('Failed to prepare student record', 'error');
            return false;
        }
    };

    /**
     * Initialize payment with Paystack
     */
    const initializePayment = async () => {
        try {
            const dashboardUrl = new URL('student-dashboard.html', window.location.href).toString();

            const response = await fetch(`${API_BASE}/api/payment/pay`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({
                    studentId: latestStudentId,
                    amount: currentRegistrationFee,
                    callbackUrl: dashboardUrl,
                    mobile: {
                        phone: paymentData.phone || undefined,
                        provider: paymentData.provider || undefined
                    }
                })
            });

            const result = await response.json().catch(() => ({}));
            if (!response.ok || result.status !== 'success' || !result.authorizationUrl) {
                const details = [result.message, result.gatewayStatus ? `(Gateway ${result.gatewayStatus})` : '']
                    .filter(Boolean)
                    .join(' ');
                setModalMessage(details || `Unable to initialize payment (HTTP ${response.status}).`, 'error');
                return false;
            }

            // Redirect to Paystack
            window.location.href = result.authorizationUrl;
            return true;
        } catch (error) {
            console.error('Payment initialization error:', error);
            setModalMessage('Payment initialization failed. Check server and try again.', 'error');
            return false;
        }
    };

    /**
     * Generate and download payment receipt as PDF
     */
    const generateAndDownloadReceipt = () => {
        try {
            const receiptHTML = `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #0c1b2a; margin: 0 0 5px 0;">Department Registration Portal</h1>
                    <p style="color: #5a6b7a; margin: 0;">Student Registration Payment Receipt</p>
                </div>
                
                <div style="border-top: 2px solid #2f80ed; border-bottom: 2px solid #2f80ed; padding: 20px 0; margin: 20px 0;">
                    <h2 style="text-align: center; color: #0c1b2a; margin: 0;">Payment Receipt</h2>
                </div>

                <div style="margin: 20px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 10px 0; color: #5a6b7a;"><strong>Receipt Reference:</strong></td>
                            <td style="padding: 10px 0; text-align: right; color: #0c1b2a; font-weight: bold;">${latestPaymentReference}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #5a6b7a;"><strong>Student Name:</strong></td>
                            <td style="padding: 10px 0; text-align: right; color: #0c1b2a;">${registrationForm.elements['fullName'].value}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #5a6b7a;"><strong>Index Number:</strong></td>
                            <td style="padding: 10px 0; text-align: right; color: #0c1b2a;">${registrationForm.elements['indexNumber'].value}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #5a6b7a;"><strong>Email:</strong></td>
                            <td style="padding: 10px 0; text-align: right; color: #0c1b2a;">${registrationForm.elements['email'].value}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #5a6b7a;"><strong>Department:</strong></td>
                            <td style="padding: 10px 0; text-align: right; color: #0c1b2a;">${registrationForm.elements['programme'].value}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #5a6b7a;"><strong>Student Level:</strong></td>
                            <td style="padding: 10px 0; text-align: right; color: #0c1b2a;">${registrationForm.elements['level'].value}</td>
                        </tr>
                        <tr style="border-top: 1px solid #eee; border-bottom: 1px solid #eee;">
                            <td style="padding: 15px 0; color: #5a6b7a;"><strong>Amount Paid:</strong></td>
                            <td style="padding: 15px 0; text-align: right; color: #1b9f7c; font-size: 1.3em; font-weight: bold;">GHS ${currentRegistrationFee.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #5a6b7a;"><strong>Status:</strong></td>
                            <td style="padding: 10px 0; text-align: right; color: #1b9f7c; font-weight: bold;">✓ Paid</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; color: #5a6b7a;"><strong>Date:</strong></td>
                            <td style="padding: 10px 0; text-align: right; color: #0c1b2a;">${new Date().toLocaleDateString()}</td>
                        </tr>
                    </table>
                </div>

                <div style="background: #f4f8ff; padding: 15px; border-radius: 8px; margin-top: 30px; color: #0c1b2a;">
                    <p style="margin: 0; font-size: 0.9em;"><strong>Thank you for your payment!</strong></p>
                    <p style="margin: 5px 0 0 0; font-size: 0.85em; color: #5a6b7a;">Please keep this receipt for your records. Your registration will be processed once all documents are verified.</p>
                </div>
            </div>
        `;

            const element = document.createElement('div');
            element.innerHTML = receiptHTML;
            element.style.padding = '20px';
            element.style.background = 'white';
            
            // Check if html2pdf is available
            if (typeof html2pdf !== 'undefined' && html2pdf) {
                const opt = {
                    margin: 10,
                    filename: `payment-receipt-${latestPaymentReference}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, allowTaint: true },
                    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
                };

                html2pdf().set(opt).from(element).save().catch((error) => {
                    console.error('Error generating PDF:', error);
                    alert('Receipt download may not be supported in your browser. You can manually save this page as PDF using Ctrl+P.');
                });
            } else {
                // Fallback: Use browser's print to PDF feature
                alert('Opening receipt in print dialog. You can save it as a PDF using your browser\'s print feature.');
                window.print();
            }
        } catch (error) {
            console.error('Error in generateAndDownloadReceipt:', error);
            alert('Error generating receipt. Please try again or use your browser\'s print feature to save as PDF.');
        }
    };

    // ========================================================================
    // ========================================================================
    // EVENT LISTENERS - PAYMENT MODAL
    // ========================================================================

    if (payBtn) {
        payBtn.addEventListener('click', openPaymentModal);
    }

    if (closePaymentModal) {
        closePaymentModal.addEventListener('click', closePaymentModalHandler);
    }

    if (cancelPaymentBtn) {
        cancelPaymentBtn.addEventListener('click', closePaymentModalHandler);
    }

    if (closeConfirmBtn) {
        closeConfirmBtn.addEventListener('click', closePaymentModalHandler);
    }

    if (paymentModal) {
        paymentModal.addEventListener('click', (e) => {
            if (e.target === paymentModal) {
                closePaymentModalHandler();
            }
        });
    }

    // Make Payment button
    if (makePaymentBtn) {
        makePaymentBtn.addEventListener('click', async () => {
            setModalMessage('', 'info');

            // Validate form
            if (!registrationForm.elements['fullName'].value || 
                !registrationForm.elements['indexNumber'].value || 
                !registrationForm.elements['email'].value ||
                !registrationForm.elements['level'].value ||
                !registrationForm.elements['programme'].value) {
                setModalMessage('Please fill in all required fields first.', 'error');
                return;
            }

            // Validate payment amount
            const amount = getCustomAmount();
            if (amount <= 0) {
                setModalMessage('Please enter a valid payment amount (must be greater than 0).', 'error');
                return;
            }

            paymentData.phone = modalMobilePhone?.value || null;
            paymentData.provider = modalMobileProvider?.value || null;

            setModalMessage('Creating student record...', 'info');
            const studentCreated = await createProvisionalStudent();
            if (!studentCreated) return;

            setModalMessage('Initializing payment...', 'info');
            currentRegistrationFee = amount; // Update the amount before sending
            await initializePayment();
        });
    }

    // Confirm Payment button
    if (confirmPaymentBtn) {
        confirmPaymentBtn.addEventListener('click', () => {
            generateAndDownloadReceipt();
            closePaymentModalHandler();
        });
    }

    // ========================================================================
    // EVENT LISTENERS - FORM SUBMISSION
    // ========================================================================

    if (registrationForm) {
        registrationForm.addEventListener('input', () => {
            saveDraftData();
        });

        registrationForm.addEventListener('change', async (e) => {
            const fieldName = e.target?.name;
            if (!FILE_FIELD_NAMES.includes(fieldName)) {
                saveDraftData();
                return;
            }

            const input = e.target;
            const file = input.files?.[0];
            if (!file) {
                delete cachedFiles[fieldName];
                syncFileRequiredState(fieldName);
                try {
                    await deleteFileDraft(fieldName);
                } catch (error) {
                    // Ignore local draft deletion failure and continue.
                }
                return;
            }

            cachedFiles[fieldName] = file;
            syncFileRequiredState(fieldName);
            try {
                await saveFileDraft(fieldName, file);
            } catch (error) {
                // Ignore local draft save failures; upload still works in-session.
            }
        });

        registrationForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = registrationForm.querySelector('.submit');
            if (submitBtn) {
                submitBtn.innerText = 'Processing...';
                submitBtn.disabled = true;
            }

            try {
                if (!latestStudentId) {
                    latestStudentId = sessionStorage.getItem('provisionalStudentId') || null;
                }
                if (!latestStudentId) {
                    try {
                        const savedData = JSON.parse(localStorage.getItem('studentData') || '{}');
                        latestStudentId = savedData.studentId || savedData._id || null;
                    } catch (error) {
                        latestStudentId = null;
                    }
                }

                if (!latestStudentId) {
                    setMessage('Please complete payment first.', 'error');
                    return;
                }

                // Verify payment status
                const statusResp = await fetch(`${API_BASE}/api/students/${latestStudentId}`, {
                    headers: { 'Authorization': `Bearer ${getAuthToken()}` }
                });

                if (!statusResp.ok) {
                    const details = await statusResp.text().catch(() => '');
                    setMessage(`Unable to verify student status.${details ? ` ${details}` : ''}`, 'error');
                    return;
                }

                const statusData = await statusResp.json();
                if (statusData.student?.paymentStatus !== 'Paid') {
                    setMessage('Payment required before completing registration.', 'error');
                    return;
                }

                // Check if all required documents are uploaded
                const passportPicture = registrationForm.passportPicture.files[0] || cachedFiles.passportPicture;
                const wassceCertificate = registrationForm.wassceCertificate.files[0] || cachedFiles.wassceCertificate;
                const feesReceipt = registrationForm.feesReceipt.files[0] || cachedFiles.feesReceipt;
                const courseRegistrationForm = registrationForm.courseRegistrationForm.files[0] || cachedFiles.courseRegistrationForm;

                if (!passportPicture || !wassceCertificate || !feesReceipt || !courseRegistrationForm) {
                    setMessage('Please upload all required documents.', 'error');
                    return;
                }

                // Upload documents
                const formData = new FormData();
                formData.append('studentId', latestStudentId);
                formData.append('passportPicture', passportPicture);
                formData.append('wassceCertificate', wassceCertificate);
                formData.append('feesReceipt', feesReceipt);
                formData.append('courseRegistrationForm', courseRegistrationForm);

                const completeResp = await fetch(`${API_BASE}/api/students/complete`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${getAuthToken()}`
                    },
                    body: formData
                });

                const rawCompleteBody = await completeResp.text().catch(() => '');
                let completeJson = {};
                try {
                    completeJson = rawCompleteBody ? JSON.parse(rawCompleteBody) : {};
                } catch (error) {
                    completeJson = {};
                }
                if (!completeResp.ok || completeJson.status !== 'success') {
                    const serverDetails = completeJson.message || rawCompleteBody.replace(/<[^>]*>/g, ' ').trim();
                    setMessage(serverDetails || 'Failed to complete registration', 'error');
                    return;
                }

                setMessage('Registration complete! Your documents have been uploaded.', 'success');
                clearDraftData();
                Object.keys(cachedFiles).forEach((key) => delete cachedFiles[key]);
                try {
                    await clearAllFileDrafts();
                } catch (error) {
                    // Ignore local draft cleanup failures.
                }
                
                // Reload student data
                setTimeout(() => {
                    window.location.reload();
                }, 2000);

            } catch (error) {
                console.error('Registration error:', error);
                setMessage('Cannot reach backend server.', 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.innerText = 'Register Account';
                    submitBtn.disabled = false;
                }
            }
        });

        // Handle form reset
        registrationForm.addEventListener('reset', async () => {
            latestStudentId = null;
            clearDraftData();
            Object.keys(cachedFiles).forEach((key) => delete cachedFiles[key]);
            FILE_FIELD_NAMES.forEach(syncFileRequiredState);
            try {
                await clearAllFileDrafts();
            } catch (error) {
                // Ignore local draft cleanup failures.
            }
            setMessage('Form cleared.', 'info');
        });

        // Initial message
        setMessage('Fill in your details and upload required documents.', 'info');
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /**
     * Check if student has completed payment after Paystack redirect
     */
    const checkPaymentStatusOnLoad = async () => {
        // Check for Paystack callback parameters first
        const reference = urlParams.get('reference') || urlParams.get('trxref');
        if (reference) {
            // Verify payment with backend
            try {
                const verifyResp = await fetch(`${API_BASE}/api/payment/verify?reference=${encodeURIComponent(reference)}`);
                if (verifyResp.ok) {
                    const verifyData = await verifyResp.json();
                    if (verifyData.status === 'success' && verifyData.data) {
                        // Find the student from the metadata
                        const studentId = verifyData.data.metadata?.studentId;
                        if (studentId) {
                            latestStudentId = studentId;
                            latestPaymentReference = reference;
                            showPaymentConfirmation(reference);
                            setMessage('Payment verified! Now upload documents and click "Register Account" to complete registration.', 'success');
                            
                            // Save to localStorage for persistence
                            localStorage.setItem('studentData', JSON.stringify({
                                studentId: latestStudentId,
                                paymentReference: reference
                            }));
                            return;
                        }
                    }
                }
            } catch (error) {
                console.error('Error verifying payment callback:', error);
            }
        }
        
        // Fallback: check existing student data
        if (!latestStudentId) return;
        
        try {
            const resp = await fetch(`${API_BASE}/api/students/${latestStudentId}`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            
            if (resp.ok) {
                const data = await resp.json();
                const student = data.student || {};
                
                // If payment has been verified, show confirmation
                if (student.paymentStatus === 'Paid' && student.paymentReference) {
                    showPaymentConfirmation(student.paymentReference);
                    setMessage('Payment verified! Now upload documents and click "Register Account" to complete registration.', 'success');
                }
            }
        } catch (error) {
            console.error('Error checking payment status:', error);
        }
    };

    // Restore saved form data first, then apply selected department fallback.
    restoreDraftData();
    const deptInput = document.getElementById('selectedDepartment') || registrationForm?.elements['programme'];
    if (deptInput && !deptInput.value) {
        deptInput.value = selectedDept;
    }
    saveDraftData();

    // Restore locally cached document files (for post-payment refresh/redirect).
    restoreFileDrafts();

    // Load student data if available
    try {
        const savedData = JSON.parse(localStorage.getItem('studentData') || '{}');
        if (savedData.studentId) {
            latestStudentId = savedData.studentId;
            // Check if payment has been completed
            checkPaymentStatusOnLoad();
        }
    } catch (error) {
        console.error('Error loading saved data:', error);
    }
});
