-- Local Compose bootstrap only. Production must create equivalent users with secret-manager passwords.
CREATE DATABASE IF NOT EXISTS college_erp;
CREATE DATABASE IF NOT EXISTS college_erp_gateway;
CREATE DATABASE IF NOT EXISTS college_erp_auth;
CREATE DATABASE IF NOT EXISTS college_erp_profile;
CREATE DATABASE IF NOT EXISTS college_erp_academic;
CREATE DATABASE IF NOT EXISTS college_erp_attendance;
CREATE DATABASE IF NOT EXISTS college_erp_marks;
CREATE DATABASE IF NOT EXISTS college_erp_paper;
CREATE DATABASE IF NOT EXISTS college_erp_notification;

CREATE USER IF NOT EXISTS 'erp_gateway'@'%' IDENTIFIED BY 'gateway_dev_change_me';
CREATE USER IF NOT EXISTS 'erp_auth'@'%' IDENTIFIED BY 'auth_dev_change_me';
CREATE USER IF NOT EXISTS 'erp_profile'@'%' IDENTIFIED BY 'profile_dev_change_me';
CREATE USER IF NOT EXISTS 'erp_academic'@'%' IDENTIFIED BY 'academic_dev_change_me';
CREATE USER IF NOT EXISTS 'erp_attendance'@'%' IDENTIFIED BY 'attendance_dev_change_me';
CREATE USER IF NOT EXISTS 'erp_marks'@'%' IDENTIFIED BY 'marks_dev_change_me';
CREATE USER IF NOT EXISTS 'erp_paper'@'%' IDENTIFIED BY 'paper_dev_change_me';
CREATE USER IF NOT EXISTS 'erp_notification'@'%' IDENTIFIED BY 'notification_dev_change_me';

GRANT ALL PRIVILEGES ON college_erp.* TO 'erp_gateway'@'%';
GRANT ALL PRIVILEGES ON college_erp.* TO 'erp_auth'@'%';
GRANT ALL PRIVILEGES ON college_erp.* TO 'erp_profile'@'%';
GRANT ALL PRIVILEGES ON college_erp.* TO 'erp_academic'@'%';
GRANT ALL PRIVILEGES ON college_erp.* TO 'erp_attendance'@'%';
GRANT ALL PRIVILEGES ON college_erp.* TO 'erp_marks'@'%';
GRANT ALL PRIVILEGES ON college_erp.* TO 'erp_paper'@'%';
GRANT ALL PRIVILEGES ON college_erp.* TO 'erp_notification'@'%';

GRANT ALL PRIVILEGES ON college_erp_gateway.* TO 'erp_gateway'@'%';
GRANT ALL PRIVILEGES ON college_erp_auth.* TO 'erp_auth'@'%';
GRANT ALL PRIVILEGES ON college_erp_profile.* TO 'erp_profile'@'%';
GRANT ALL PRIVILEGES ON college_erp_academic.* TO 'erp_academic'@'%';
GRANT ALL PRIVILEGES ON college_erp_attendance.* TO 'erp_attendance'@'%';
GRANT ALL PRIVILEGES ON college_erp_marks.* TO 'erp_marks'@'%';
GRANT ALL PRIVILEGES ON college_erp_paper.* TO 'erp_paper'@'%';
GRANT ALL PRIVILEGES ON college_erp_notification.* TO 'erp_notification'@'%';
FLUSH PRIVILEGES;
