<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

$segmentId = $_GET['id'] ?? '';

if (empty($segmentId) || !ctype_digit($segmentId)) {
    http_response_code(400);
    echo json_encode(["error" => "無効な Segment ID です"]);
    exit;
}

// Strava APIアクセストークン（長期運用時はRefresh Tokenによる自動更新ロジックを推奨）
$accessToken = '5c247257c1c38ffa225e8b014cc9f12a344aaad0';

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "https://www.strava.com/api/v3/segments/" . $segmentId);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer " . $accessToken
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200) {
    http_response_code($httpCode);
    echo json_encode(["error" => "Strava APIからのデータ取得に失敗しました"]);
    exit;
}

$data = json_decode($response, true);

// Angular側が必要とする最小限のデータ整形して返却
echo json_encode([
    'name' => $data['name'] ?? '',
    'distanceKm' => round(($data['distance'] ?? 0) / 1000, 2),
    'elevationGainM' => round($data['total_elevation_gain'] ?? 0)
]);