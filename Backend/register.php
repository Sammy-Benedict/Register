<?php
header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    echo json_encode(["status" => "error", "message" => "Invalid request"]);
    exit;
}

$fullName = trim($_POST["fullName"] ?? "");
$indexNumber = trim($_POST["indexNumber"] ?? "");
$email = trim($_POST["email"] ?? "");
$programType = trim($_POST["programType"] ?? "");

if (!$fullName || !$indexNumber || !$email || !$programType) {
    echo json_encode(["status" => "error", "message" => "All fields are required"]);
    exit;
}

// File upload
$uploadDir = "uploads/";
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

if (!empty($_FILES["documents"]["name"][0])) {
    foreach ($_FILES["documents"]["tmp_name"] as $key => $tmpName) {
        $fileName = basename($_FILES["documents"]["name"][$key]);
        move_uploaded_file($tmpName, $uploadDir . time() . "_" . $fileName);
    }
}

// Save to database (example – adjust for MySQL)
$conn = new mysqli("localhost", "root", "", "cs_portal");

if ($conn->connect_error) {
    echo json_encode(["status" => "error", "message" => "Database connection failed"]);
    exit;
}

$stmt = $conn->prepare(
    "INSERT INTO students (full_name, index_number, email, program_type)
     VALUES (?, ?, ?, ?)"
);

$stmt->bind_param("ssss", $fullName, $indexNumber, $email, $programType);
$stmt->execute();

$stmt->close();
$conn->close();

echo json_encode(["status" => "success"]);
