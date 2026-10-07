import subprocess

KEY = r"C:\Users\Quantum\Downloads\ssh-key-2026-10-06.key"
VPS = "ubuntu@159.54.146.150"

remote_code = """
with open('/tmp/main.js', 'rb') as f:
    content = f.read()

target = b't?`http://${window.location.hostname||"127.0.0.1"}:8080`:""'
replacement = b'("localhost"===window.location.hostname)?`http://localhost:8080`:""'

if target in content:
    content_new = content.replace(target, replacement)
    with open('/tmp/main_patched.js', 'wb') as f:
        f.write(content_new)
    print("SUCCESS: Target replaced. New size:", len(content_new))
else:
    print("ERROR: Target not found!")
"""

cmd = [
    "ssh", "-i", KEY, "-o", "StrictHostKeyChecking=no", VPS,
    "sudo docker cp taxihub-frontend:/usr/share/nginx/html/static/js/main.0bb5c45d.js /tmp/main.js && python3 - && sudo docker cp /tmp/main_patched.js taxihub-frontend:/usr/share/nginx/html/static/js/main.0bb5c45d.js && sudo docker restart taxihub-frontend"
]

proc = subprocess.run(cmd, input=remote_code.encode("utf-8"), capture_output=True)
print("STDOUT:", proc.stdout.decode("utf-8", errors="replace"))
print("STDERR:", proc.stderr.decode("utf-8", errors="replace"))
