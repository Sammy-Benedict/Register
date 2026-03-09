document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = window.APP_CONFIG?.API_BASE_URL || "http://localhost:5000";
    const authToken = localStorage.getItem("authToken");
    const userRole = localStorage.getItem("userRole");

    const totalEl = document.getElementById("total");
    const paidEl = document.getElementById("paid");
    const studentsBody = document.getElementById("studentsBody");
    const messageEl = document.getElementById("adminMessage");
    const refreshBtn = document.getElementById("refreshAdminBtn");
    const sortByLevelEl = document.getElementById("sortByLevel");
    const sortByClassEl = document.getElementById("sortByClass");

    let allStudents = [];

    if (!authToken || userRole !== "admin") {
        window.location.href = "admin-login.html";
        return;
    }

    const setMessage = (message, type = "info") => {
        messageEl.textContent = message;
        messageEl.className = `info-banner ${type}`;
    };

    const buildFileUrl = (filePath) => {
        if (!filePath) return "";
        if (/^https?:\/\//i.test(filePath)) return filePath;
        const normalized = String(filePath).replace(/\\/g, "/").replace(/^\/+/, "");
        return `${API_BASE}/${normalized}`;
    };

    const formatAmountPaid = (student) => {
        const candidates = [
            student.amountPaid,
            student.paidAmount,
            student.paymentAmount,
            student.amount,
            student.payment?.amount,
            student.paymentDetails?.amount
        ];

        const parsedAmounts = candidates
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0);

        if (parsedAmounts.length) {
            return `GHS ${parsedAmounts[0].toFixed(2)}`;
        }

        return student.paymentStatus === "Paid" ? "Paid" : "Pending";
    };

    const renderStudents = (students) => {
        studentsBody.innerHTML = "";

        if (!students.length) {
            const row = document.createElement("tr");
            row.innerHTML = '<td colspan="9">No student records found.</td>';
            studentsBody.appendChild(row);
            return;
        }

        students.forEach((student) => {
            const documents = [];
            if (student.documents?.passportPicture) documents.push('Passport');
            if (student.documents?.wassceCertificate) documents.push('WASSCE');
            if (student.documents?.feesReceipt) documents.push('Fees');
            if (student.documents?.courseRegistrationForm) documents.push('Course Form');
            if (student.documents?.resultSlip) documents.push('Result Slip');
            
            const resultSlipUrl = buildFileUrl(student.documents?.resultSlip);
            const row = document.createElement("tr");
            row.dataset.studentId = student._id || "";
            row.innerHTML = `
                <td>${student.fullName || "-"}</td>
                <td>${student.indexNumber || "-"}</td>
                <td>${student.email || "-"}</td>
                <td>${student.telephone || "-"}</td>
                <td>${student.programme || "-"}</td>
                <td>${student.programClass || "-"}</td>
                <td>${formatAmountPaid(student)}</td>
                <td>${documents.length ? documents.join(', ') : 'None'}</td>
                <td>
                    <div class="result-slip-tools">
                        ${resultSlipUrl
                            ? `<a class="result-slip-link" href="${resultSlipUrl}" target="_blank" rel="noopener noreferrer">View Slip</a>`
                            : '<span class="result-slip-missing">No slip</span>'}
                        <input type="file" class="result-slip-input" accept=".pdf,image/*">
                        <button type="button" class="result-slip-upload-btn">Upload</button>
                    </div>
                </td>
            `;
            studentsBody.appendChild(row);
        });
    };

    const uploadResultSlip = async (studentId, file, buttonEl) => {
        const formData = new FormData();
        formData.append("resultSlip", file);

        const response = await fetch(`${API_BASE}/api/admin/students/${encodeURIComponent(studentId)}/result-slip`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${authToken}`
            },
            body: formData
        });

        const json = await response.json().catch(() => ({}));
        if (!response.ok || json.status !== "success") {
            throw new Error(json.message || "Failed to upload result slip");
        }

        const updated = json.student || {};
        allStudents = allStudents.map((student) => (
            student._id === updated._id ? updated : student
        ));

        applySorting();
        setMessage("Result slip uploaded successfully.", "success");
        if (buttonEl) {
            buttonEl.textContent = "Upload";
            buttonEl.disabled = false;
        }
    };

    const loadAdminData = async () => {
        try {
            const [statsResponse, studentsResponse] = await Promise.all([
                fetch(`${API_BASE}/api/admin/stats`, {
                    headers: {
                        "Authorization": `Bearer ${authToken}`
                    }
                }),
                fetch(`${API_BASE}/api/admin/students`, {
                    headers: {
                        "Authorization": `Bearer ${authToken}`
                    }
                })
            ]);

            const stats = await statsResponse.json().catch(() => ({}));
            const students = await studentsResponse.json().catch(() => ({}));

            if (!statsResponse.ok || !studentsResponse.ok) {
                const details = stats.message || students.message || "Failed to fetch admin data";
                throw new Error(details);
            }

            totalEl.textContent = stats.stats?.total ?? 0;
            paidEl.textContent = stats.stats?.paid ?? 0;
            allStudents = Array.isArray(students.students) ? students.students : [];
            applySorting();
            setMessage("Admin dashboard synced with server.", "success");
        } catch (error) {
            totalEl.textContent = "0";
            paidEl.textContent = "0";
            renderStudents([]);
            setMessage(error.message || "Unable to load admin data. Ensure backend server is running.", "error");
        }
    };

    const applySorting = () => {
        const levelValue = sortByLevelEl.value;
        const classValue = sortByClassEl.value;
        let filteredStudents = allStudents;

        if (levelValue) {
            filteredStudents = filteredStudents.filter(student => student.level === levelValue);
        }

        if (classValue) {
            filteredStudents = filteredStudents.filter(student => student.programClass === classValue);
        }

        renderStudents(filteredStudents);
    };

    sortByLevelEl.addEventListener("change", applySorting);
    sortByClassEl.addEventListener("change", applySorting);
    studentsBody.addEventListener("click", async (event) => {
        const button = event.target.closest(".result-slip-upload-btn");
        if (!button) return;

        const row = button.closest("tr");
        const studentId = row?.dataset?.studentId;
        const fileInput = row?.querySelector(".result-slip-input");
        const file = fileInput?.files?.[0];

        if (!studentId) {
            setMessage("Cannot upload slip: missing student ID.", "error");
            return;
        }

        if (!file) {
            setMessage("Select a result slip file first.", "error");
            return;
        }

        button.disabled = true;
        button.textContent = "Uploading...";
        try {
            await uploadResultSlip(studentId, file, button);
        } catch (error) {
            button.disabled = false;
            button.textContent = "Upload";
            setMessage(error.message || "Failed to upload result slip.", "error");
        }
    });

    if (refreshBtn) {
        refreshBtn.addEventListener("click", loadAdminData);
    }

    loadAdminData();
});
